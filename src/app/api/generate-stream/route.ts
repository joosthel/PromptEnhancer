/**
 * @file route.ts
 * POST /api/generate-stream — Streaming version of /api/generate.
 *
 * Uses Server-Sent Events to progressively send pipeline stages:
 *   1. event: vision   — visual style cues from reference images
 *   2. event: brief    — locked creative brief
 *   3. event: prompts  — generated prompts array
 *   4. event: done     — signals completion
 *   5. event: error    — signals an error at any stage
 *
 * The client receives results as each pipeline step completes,
 * so it can show the brief while prompts are still generating.
 */

import { NextRequest } from 'next/server'
import { callOpenRouterWithFallback, parseJsonResponse, ContentPart, TEXT_MODEL, TEXT_MODEL_FALLBACK, VISION_MODEL, VISION_MODEL_FALLBACK } from '@/lib/openrouter'
import { GEMINI_VISION_PROMPT, VisualStyleCues, ImageLabel, CreativeBrief } from '@/lib/system-prompt'
import { buildSystemPrompt, buildUserMessage, BRIEF_SYSTEM_PROMPT, buildBriefUserMessage } from '@/lib/prompt-engine'
import { TargetModel, GenerationMode, VALID_TARGET_MODELS, VALID_GENERATION_MODES } from '@/lib/model-profiles'
import { VisualStyleCuesSchema, CreativeBriefSchema, PromptsResponseSchema } from '@/lib/schemas'
import { rateLimit } from '@/lib/rate-limit'

export const maxDuration = 60

interface GenerateStreamRequest {
  images: Array<
    { type: 'base64'; data: string; mimeType: string } | { type: 'url'; url: string }
  >
  userInputs: { description: string }
  promptCount: number
  targetModel?: TargetModel
  mode?: GenerationMode
  imageLabels?: ImageLabel[]
  cachedVisionCues?: VisualStyleCues
  cachedBrief?: CreativeBrief
  briefOnly?: boolean
}

function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.OPENROUTER_API_KEY

  if (!apiKey?.trim()) {
    return new Response(sseEvent('error', { error: 'OPENROUTER_API_KEY is not set.' }), {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
    })
  }

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  const limit = rateLimit(ip)
  if (!limit.success) {
    return new Response(sseEvent('error', { error: 'Too many requests. Please wait a moment.' }), {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
    })
  }

  let body: GenerateStreamRequest
  try {
    body = await request.json()
  } catch {
    return new Response(sseEvent('error', { error: 'Invalid request body.' }), {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
    })
  }

  const { images, userInputs, promptCount, targetModel: rawTargetModel, mode: rawMode, imageLabels, cachedVisionCues } = body

  if (rawTargetModel && !VALID_TARGET_MODELS.has(rawTargetModel)) {
    return new Response(sseEvent('error', { error: 'Invalid target model.' }), {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
    })
  }
  if (rawMode && !VALID_GENERATION_MODES.has(rawMode)) {
    return new Response(sseEvent('error', { error: 'Invalid generation mode.' }), {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
    })
  }

  const targetModel: TargetModel = rawTargetModel ?? 'flux-2-klein-9b'
  const mode: GenerationMode = rawMode ?? 'generate'
  const hasImages = Array.isArray(images) && images.length > 0
  const hasUserInputs = userInputs.description?.trim()

  if (!hasImages && !hasUserInputs) {
    return new Response(sseEvent('error', { error: 'Provide reference images or describe your concept to get started.' }), {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
    })
  }

  if (mode === 'edit' && !hasImages) {
    return new Response(sseEvent('error', { error: 'Edit mode requires at least one reference image.' }), {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
    })
  }

  if (hasImages && images.length > 6) {
    return new Response(sseEvent('error', { error: 'Maximum 6 reference images.' }), {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
    })
  }

  if (hasImages) {
    for (const img of images) {
      if (img.type === 'base64' && img.data.length > 2_800_000) {
        return new Response(sseEvent('error', { error: 'Image too large. Max ~2MB per image.' }), {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
        })
      }
    }
  }

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(new TextEncoder().encode(sseEvent(event, data)))
      }

      try {
        let visualStyleCues: VisualStyleCues | undefined
        let creativeBrief: CreativeBrief | undefined

        // Step 1: Vision analysis
        send('phase', { phase: 'analyzing' })

        if (hasImages && !cachedVisionCues) {
          const imageContentParts: ContentPart[] = images.map((img) => {
            if (img.type === 'base64') {
              return { type: 'image_url' as const, image_url: { url: `data:${img.mimeType};base64,${img.data}` } }
            }
            return { type: 'image_url' as const, image_url: { url: img.url } }
          })

          const visionContent: ContentPart[] = [
            ...imageContentParts,
            { type: 'text', text: GEMINI_VISION_PROMPT },
          ]

          const visionResponse = await callOpenRouterWithFallback({
            model: VISION_MODEL,
            apiKey,
            responseFormat: 'json_object',
            messages: [{ role: 'user', content: visionContent }],
          }, VISION_MODEL_FALLBACK)

          try {
            visualStyleCues = parseJsonResponse(visionResponse, VisualStyleCuesSchema)
            send('vision', visualStyleCues)
          } catch (e) {
            console.error('Vision parse failed:', e instanceof Error ? e.message : e)
          }
        } else if (cachedVisionCues) {
          visualStyleCues = cachedVisionCues
        }

        // Step 2: Creative brief
        send('phase', { phase: 'briefing' })

        if (body.cachedBrief) {
          creativeBrief = body.cachedBrief
        } else if (mode === 'generate' || mode === 'video' || (mode === 'edit' && hasUserInputs)) {
          const briefUserMessage = buildBriefUserMessage(userInputs, mode, promptCount, visualStyleCues, imageLabels)

          const briefResponse = await callOpenRouterWithFallback({
            model: TEXT_MODEL,
            apiKey,
            responseFormat: 'json_object',
            temperature: 0.5,
            top_p: 0.85,
            max_tokens: 4096,
            stop: ['\n\n\n'],
            messages: [
              { role: 'system', content: BRIEF_SYSTEM_PROMPT },
              { role: 'user', content: briefUserMessage },
            ],
          }, TEXT_MODEL_FALLBACK)

          try {
            creativeBrief = parseJsonResponse(briefResponse, CreativeBriefSchema)
            send('brief', creativeBrief)
          } catch (e) {
            console.error('Brief parse failed:', e instanceof Error ? e.message : e)
          }
        }

        // Early return for Art Direction mode
        if (body.briefOnly) {
          send('done', { creativeBrief, visualStyleCues })
          controller.close()
          return
        }

        // Step 3: Prompt generation
        send('phase', { phase: 'generating' })

        const userMessage = buildUserMessage(
          userInputs, promptCount, targetModel, mode,
          visualStyleCues, imageLabels, creativeBrief
        )

        const promptResponse = await callOpenRouterWithFallback({
          model: TEXT_MODEL,
          apiKey,
          responseFormat: 'json_object',
          temperature: 0.4,
          top_p: 0.85,
          max_tokens: 4096,
          stop: ['\n\n\n'],
          messages: [
            { role: 'system', content: buildSystemPrompt(targetModel, mode) },
            { role: 'user', content: userMessage },
          ],
        }, TEXT_MODEL_FALLBACK)

        const parsed = parseJsonResponse(promptResponse, PromptsResponseSchema)

        send('prompts', {
          prompts: parsed.prompts,
          visualStyleCues,
          creativeBrief,
          targetModel,
          mode,
        })

        send('done', {})
        controller.close()
      } catch (error) {
        const message = error instanceof Error
          ? (error.message.startsWith('OpenRouter API error') ? 'Generation failed. Please try again.' : error.message)
          : 'An unexpected error occurred'
        send('error', { error: message })
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
