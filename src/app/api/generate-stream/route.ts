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
import { callOpenRouterWithFallback, parseJsonResponse, TEXT_MODEL, TEXT_MODEL_FALLBACK, analyzeImagesParallel, toApiErrorResponse, type ImagePayload } from '@/lib/openrouter'
import { GEMINI_VISION_PROMPT, VisualStyleCues, ImageLabel, CreativeBrief } from '@/lib/system-prompt'
import { buildSystemPrompt, buildUserMessage, BRIEF_SYSTEM_PROMPT, buildBriefUserMessage } from '@/lib/prompt-engine'
import { TargetModel, GenerationMode, VALID_TARGET_MODELS, VALID_GENERATION_MODES } from '@/lib/model-profiles'
import { VisualStyleCuesSchema, CreativeBriefSchema, PromptsResponseSchema } from '@/lib/schemas'
import { rateLimit } from '@/lib/rate-limit'

export const maxDuration = 300

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
  /** Indices of prompts to keep unchanged during selective regeneration */
  lockedIndices?: number[]
  /** Existing prompts to merge locked ones back into results */
  existingPrompts?: Array<{ label: string; prompt: string; negativePrompt?: string }>
}

function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

/**
 * Builds a minimal fallback brief from user inputs and vision cues when
 * the full brief generation fails. Provides enough structure to anchor
 * downstream prompt generation rather than generating unanchored prompts.
 */
function buildFallbackBrief(
  userInputs: { description: string },
  visualStyleCues: VisualStyleCues | undefined,
  mode: GenerationMode,
  promptCount: number
): CreativeBrief | null {
  const desc = userInputs.description?.trim()
  if (!desc && !visualStyleCues) return null

  const modeLabel = mode === 'generate' ? 'image generation' : mode === 'edit' ? 'image editing' : 'video generation'
  const colorAnchors = visualStyleCues?.hexPalette?.slice(0, 5) ?? []

  return {
    intent: desc ? desc.split('.')[0] : `${modeLabel} based on reference images`,
    technicalApproach: 'Natural light, medium focal length, balanced composition',
    creativeVision: desc || (visualStyleCues?.atmosphere ?? 'Visual narrative guided by reference imagery'),
    visualMetaphor: '',
    dominantCreativePriority: 'lighting',
    concepts: Array.from({ length: promptCount }, (_, i) => ({
      concept: desc ? `Frame ${i + 1}: ${desc}` : `Frame ${i + 1}`,
      role: 'primary' as const,
      frame: i + 1,
      emotionalIntent: '',
      shotScale: ['wide establishing', 'medium', 'close-up', 'medium', 'wide establishing', 'close-up'][i % 6],
      cameraAngle: ['eye-level', 'low-angle', 'high angle', 'eye-level', 'overhead', 'low-angle'][i % 6],
      subjectPlacement: 'rule-of-thirds',
      depthPlanes: 'foreground / midground / background',
    })),
    medium: visualStyleCues?.mediumType !== 'photograph' ? (visualStyleCues?.mediumDetail ?? undefined) : undefined,
    colorGrade: visualStyleCues?.atmosphere ?? 'Natural tones with balanced contrast',
    colorAnchors: colorAnchors.length > 0 ? colorAnchors : ['neutral tones'],
    lightSource: 'Natural ambient light',
    materials: 'Natural surfaces and textures',
    mood: visualStyleCues?.atmosphere ?? (desc ? 'As described' : 'Contemplative'),
    subjectDirection: desc || 'Central subject with natural presence',
    environmentDirection: 'As suggested by reference imagery',
    visualMotifs: [],
    narrativeArc: promptCount > 1 ? 'Progressive exploration of the concept' : '',
    fullBrief: desc || (visualStyleCues?.description ?? 'Generation based on provided inputs'),
  }
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
      let closed = false
      const send = (event: string, data: unknown) => {
        if (closed) return
        controller.enqueue(new TextEncoder().encode(sseEvent(event, data)))
      }

      // Timeout budget: track elapsed time across pipeline stages.
      // Total budget is 280s (maxDuration 300s minus 20s margin).
      const TOTAL_BUDGET_MS = 280_000
      const pipelineStart = Date.now()
      function remainingMs(reserveMs = 15_000): number {
        return Math.max(15_000, TOTAL_BUDGET_MS - (Date.now() - pipelineStart) - reserveMs)
      }

      try {
        let visualStyleCues: VisualStyleCues | undefined
        let creativeBrief: CreativeBrief | undefined

        // Step 1: Vision analysis
        send('phase', { phase: 'analyzing' })

        if (hasImages && !cachedVisionCues) {
          const visionTimeout = Math.min(45_000, remainingMs(90_000))
          const { cues, failCount } = await analyzeImagesParallel(
            images as ImagePayload[],
            apiKey,
            visionTimeout,
          )

          if (cues) {
            visualStyleCues = cues
            send('vision', visualStyleCues)
            if (failCount > 0) {
              send('phase', { phase: 'briefing', warning: `${failCount} of ${images.length} images could not be analyzed.` })
            }
          } else {
            send('phase', { phase: 'briefing', warning: 'Vision analysis failed — continuing without style cues.' })
          }
        } else if (cachedVisionCues) {
          visualStyleCues = cachedVisionCues
        }

        // Step 2: Creative brief
        send('phase', { phase: 'briefing' })

        if (body.cachedBrief) {
          creativeBrief = body.cachedBrief
        } else if (mode === 'generate' || mode === 'video' || (mode === 'edit' && hasUserInputs)) {
          const briefTimeout = Math.min(55_000, remainingMs(60_000))
          const briefUserMessage = buildBriefUserMessage(userInputs, mode, promptCount, visualStyleCues, imageLabels)

          const briefOptions = {
            model: TEXT_MODEL,
            apiKey,
            responseFormat: 'json_object' as const,
            temperature: 0.3,
            top_p: 0.85,
            max_tokens: 8192,
            timeoutMs: briefTimeout,
            messages: [
              { role: 'system' as const, content: BRIEF_SYSTEM_PROMPT },
              { role: 'user' as const, content: briefUserMessage },
            ],
          }

          let briefParseError: string | undefined
          for (let briefAttempt = 0; briefAttempt < 2; briefAttempt++) {
            try {
              const briefResponse = await callOpenRouterWithFallback(
                briefAttempt === 0 ? briefOptions : { ...briefOptions, temperature: 0.15 },
                TEXT_MODEL_FALLBACK
              )
              creativeBrief = parseJsonResponse(briefResponse, CreativeBriefSchema)
              send('brief', creativeBrief)
              briefParseError = undefined
              break
            } catch (e) {
              briefParseError = e instanceof Error ? e.message : String(e)
              console.error(`Brief attempt ${briefAttempt + 1} failed:`, briefParseError)
            }
          }
          if (briefParseError) {
            // Build a minimal fallback brief from available data to anchor prompt generation
            const fallbackBrief = buildFallbackBrief(userInputs, visualStyleCues, mode, promptCount)
            if (fallbackBrief) {
              creativeBrief = fallbackBrief
              send('brief', creativeBrief)
              send('phase', { phase: 'generating', warning: 'Brief generation had issues — using simplified brief.' })
            } else {
              send('phase', { phase: 'generating', warning: 'Brief generation failed — generating prompts without brief.' })
            }
          }
        }

        // Early return for Art Direction mode
        if (body.briefOnly) {
          send('done', { creativeBrief, visualStyleCues })
          closed = true
          controller.close()
          return
        }

        // Step 3: Prompt generation
        send('phase', { phase: 'generating' })

        const lockedSet = new Set(body.lockedIndices ?? [])
        const existingPrompts = body.existingPrompts ?? []
        const hasLocked = lockedSet.size > 0 && existingPrompts.length > 0
        const regenerateCount = hasLocked ? promptCount - lockedSet.size : promptCount
        const effectiveCount = regenerateCount > 0 ? regenerateCount : promptCount

        const systemPrompt = buildSystemPrompt(targetModel, mode, creativeBrief?.medium)

        // Split generation: for 3+ prompts, generate in two batches at different
        // temperatures to create natural variety in the output.
        let allGeneratedPrompts: Array<{ label: string; prompt: string; negativePrompt?: string }> = []

        if (effectiveCount > 2) {
          const firstBatchCount = Math.ceil(effectiveCount / 2)
          const secondBatchCount = effectiveCount - firstBatchCount

          // First batch: standard temperature
          const firstMessage = buildUserMessage(
            userInputs, firstBatchCount, targetModel, mode,
            visualStyleCues, imageLabels, creativeBrief
          )
          const promptTimeout1 = Math.min(55_000, remainingMs(65_000))
          const firstResponse = await callOpenRouterWithFallback({
            model: TEXT_MODEL,
            apiKey,
            responseFormat: 'json_object',
            temperature: 0.4,
            top_p: 0.85,
            max_tokens: 8192,
            timeoutMs: promptTimeout1,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: firstMessage },
            ],
          }, TEXT_MODEL_FALLBACK)
          const firstParsed = parseJsonResponse(firstResponse, PromptsResponseSchema)
          allGeneratedPrompts.push(...firstParsed.prompts)

          // Second batch: higher temperature + differentiation instruction
          try {
            const existingLabels = firstParsed.prompts.map(p => p.label).join(', ')
            const secondMessage = buildUserMessage(
              userInputs, secondBatchCount, targetModel, mode,
              visualStyleCues, imageLabels, creativeBrief
            ) + `\n\nDIFFERENTIATION: The following shots already exist: ${existingLabels}. Your ${secondBatchCount} prompts must be visually and structurally DISTINCT from those — different openings, different emphasis, different sentence rhythm.`

            const promptTimeout2 = Math.min(55_000, remainingMs(5_000))
            const secondResponse = await callOpenRouterWithFallback({
              model: TEXT_MODEL,
              apiKey,
              responseFormat: 'json_object',
              temperature: 0.55,
              top_p: 0.9,
              max_tokens: 8192,
              timeoutMs: promptTimeout2,
              messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: secondMessage },
              ],
            }, TEXT_MODEL_FALLBACK)
            const secondParsed = parseJsonResponse(secondResponse, PromptsResponseSchema)
            allGeneratedPrompts.push(...secondParsed.prompts)
          } catch (e) {
            // Second batch failed — return what we have from the first batch
            console.warn('Second prompt batch failed, returning partial results:', e instanceof Error ? e.message : e)
            send('phase', { phase: 'generating', warning: `Generated ${firstBatchCount} of ${effectiveCount} prompts — second batch timed out.` })
          }
        } else {
          // Small batch (1-2 prompts): single call
          const userMessage = buildUserMessage(
            userInputs, effectiveCount, targetModel, mode,
            visualStyleCues, imageLabels, creativeBrief
          )
          const promptTimeout = Math.min(60_000, remainingMs(5_000))
          const promptResponse = await callOpenRouterWithFallback({
            model: TEXT_MODEL,
            apiKey,
            responseFormat: 'json_object',
            temperature: 0.4,
            top_p: 0.85,
            max_tokens: 8192,
            timeoutMs: promptTimeout,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userMessage },
            ],
          }, TEXT_MODEL_FALLBACK)
          const parsed = parseJsonResponse(promptResponse, PromptsResponseSchema)
          allGeneratedPrompts = parsed.prompts
        }

        // Merge locked prompts back into their original positions
        let finalPrompts: Array<{ label: string; prompt: string; negativePrompt?: string }>
        if (hasLocked) {
          finalPrompts = []
          let newIdx = 0
          for (let i = 0; i < promptCount; i++) {
            if (lockedSet.has(i) && i < existingPrompts.length) {
              finalPrompts.push(existingPrompts[i])
            } else if (newIdx < allGeneratedPrompts.length) {
              finalPrompts.push(allGeneratedPrompts[newIdx])
              newIdx++
            }
          }
        } else {
          finalPrompts = allGeneratedPrompts
        }

        send('prompts', {
          prompts: finalPrompts,
          visualStyleCues,
          creativeBrief,
          targetModel,
          mode,
        })

        send('done', {})
        closed = true
        controller.close()
      } catch (error) {
        const { error: message, code } = toApiErrorResponse(error)
        send('error', { error: message, code })
        closed = true
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
