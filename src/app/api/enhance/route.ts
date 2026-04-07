/**
 * @file route.ts
 * POST /api/enhance — Takes a raw prompt and optimizes it for the target model.
 *
 * Optional: if reference images were uploaded, runs Gemini vision first to extract
 * visual style cues, then uses them as a style guide during enhancement.
 */

import { NextRequest, NextResponse } from 'next/server'
import { callOpenRouterWithFallback, parseJsonResponse, ContentPart, TEXT_MODEL, TEXT_MODEL_FALLBACK, VISION_MODEL, VISION_MODEL_FALLBACK } from '@/lib/openrouter'
import { VisualStyleCuesSchema, SinglePromptResponseSchema } from '@/lib/schemas'
import { GEMINI_VISION_PROMPT, VisualStyleCues, ImageLabel } from '@/lib/system-prompt'
import { buildEnhanceSystemPrompt, buildEnhanceUserMessage } from '@/lib/prompt-engine'
import { TargetModel, GenerationMode, VALID_TARGET_MODELS, VALID_GENERATION_MODES } from '@/lib/model-profiles'
import { rateLimit } from '@/lib/rate-limit'

export const maxDuration = 60

export interface EnhanceRequest {
  prompt: string
  images?: Array<
    { type: 'base64'; data: string; mimeType: string } | { type: 'url'; url: string }
  >
  targetModel?: TargetModel
  mode?: GenerationMode
  imageLabels?: ImageLabel[]
  cachedVisionCues?: VisualStyleCues
}

export interface EnhanceResponse {
  prompt: string
  visualStyleCues?: VisualStyleCues
  targetModel: TargetModel
  mode: GenerationMode
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.OPENROUTER_API_KEY

  if (!apiKey?.trim()) {
    return NextResponse.json(
      { error: 'OPENROUTER_API_KEY is not set. Add it to your .env.local file.' },
      { status: 500 }
    )
  }

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  const limit = rateLimit(ip)
  if (!limit.success) {
    return NextResponse.json(
      { error: 'Too many requests. Please wait a moment.' },
      { status: 429, headers: { 'Retry-After': '60' } }
    )
  }

  try {
    const body: EnhanceRequest = await request.json()
    const { prompt, images, targetModel: rawTargetModel, mode: rawMode, imageLabels, cachedVisionCues } = body

    if (rawTargetModel && !VALID_TARGET_MODELS.has(rawTargetModel)) {
      return NextResponse.json({ error: 'Invalid target model.' }, { status: 400 })
    }
    if (rawMode && !VALID_GENERATION_MODES.has(rawMode)) {
      return NextResponse.json({ error: 'Invalid generation mode.' }, { status: 400 })
    }

    const targetModel: TargetModel = rawTargetModel ?? 'flux-2-klein-9b'
    const mode: GenerationMode = rawMode ?? 'generate'

    if (!prompt?.trim()) {
      return NextResponse.json(
        { error: 'Paste a prompt to enhance.' },
        { status: 400 }
      )
    }

    let visualStyleCues: VisualStyleCues | undefined
    const hasImages = Array.isArray(images) && images.length > 0

    if (hasImages && images.length > 6) {
      return NextResponse.json({ error: 'Maximum 6 reference images.' }, { status: 400 })
    }
    if (hasImages) {
      for (const img of images) {
        if (img.type === 'base64' && img.data.length > 2_800_000) {
          return NextResponse.json({ error: 'Image too large. Max ~2MB per image.' }, { status: 400 })
        }
      }
    }

    // Step 1 (optional): Vision analysis for style reference
    if (hasImages && !cachedVisionCues) {
      const imageContentParts: ContentPart[] = images.map((img) => {
        if (img.type === 'base64') {
          return {
            type: 'image_url',
            image_url: { url: `data:${img.mimeType};base64,${img.data}` },
          }
        }
        return { type: 'image_url', image_url: { url: img.url } }
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
      } catch (e) {
        console.error('Vision analysis parse failed, continuing without style cues:', e instanceof Error ? e.message : e)
      }
    } else if (cachedVisionCues) {
      visualStyleCues = cachedVisionCues
    }

    // Step 2: Enhance the prompt
    const userMessage = buildEnhanceUserMessage(prompt, targetModel, mode, visualStyleCues, imageLabels)

    const enhanceResponse = await callOpenRouterWithFallback({
      model: TEXT_MODEL,
      apiKey,
      responseFormat: 'json_object',
      temperature: 0.4,
      top_p: 0.85,
      max_tokens: 2048,
      stop: ['\n\n\n'],
      messages: [
        { role: 'system', content: buildEnhanceSystemPrompt(targetModel, mode) },
        { role: 'user', content: userMessage },
      ],
    }, TEXT_MODEL_FALLBACK)

    const parsed = parseJsonResponse(enhanceResponse, SinglePromptResponseSchema)

    const response: EnhanceResponse = {
      prompt: parsed.prompt,
      visualStyleCues,
      targetModel,
      mode,
    }

    return NextResponse.json(response)
  } catch (error) {
    const message = error instanceof Error
      ? (error.message.startsWith('OpenRouter API error') ? 'Generation failed. Please try again.' : error.message)
      : 'An unexpected error occurred'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
