import { NextRequest, NextResponse } from 'next/server'
import { callOpenRouter, callOpenRouterWithFallback, parseJsonResponse, ContentPart, TEXT_MODEL, TEXT_MODEL_FALLBACK, VISION_MODEL, VISION_MODEL_FALLBACK } from '@/lib/openrouter'
import { GEMINI_VISION_PROMPT, UserInputs, VisualStyleCues, ImageLabel, CreativeBrief } from '@/lib/system-prompt'
import { buildSystemPrompt, buildUserMessage, BRIEF_SYSTEM_PROMPT, buildBriefUserMessage } from '@/lib/prompt-engine'
import { TargetModel, GenerationMode, VALID_TARGET_MODELS, VALID_GENERATION_MODES } from '@/lib/model-profiles'
import { rateLimit } from '@/lib/rate-limit'

export const maxDuration = 60

export interface GenerateRequest {
  images: Array<
    { type: 'base64'; data: string; mimeType: string } | { type: 'url'; url: string }
  >
  userInputs: UserInputs
  promptCount: number
  targetModel?: TargetModel
  mode?: GenerationMode
  imageLabels?: ImageLabel[]
  cachedVisionCues?: VisualStyleCues
  cachedBrief?: CreativeBrief
  briefOnly?: boolean
}

export interface GenerateResponse {
  prompts: Array<{ label: string; prompt: string; negativePrompt?: string }>
  visualStyleCues?: VisualStyleCues
  creativeBrief?: CreativeBrief
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
    const body: GenerateRequest = await request.json()
    const { images, userInputs, promptCount, targetModel: rawTargetModel, mode: rawMode, imageLabels, cachedVisionCues } = body

    if (rawTargetModel && !VALID_TARGET_MODELS.has(rawTargetModel)) {
      return NextResponse.json({ error: 'Invalid target model.' }, { status: 400 })
    }
    if (rawMode && !VALID_GENERATION_MODES.has(rawMode)) {
      return NextResponse.json({ error: 'Invalid generation mode.' }, { status: 400 })
    }

    const targetModel: TargetModel = rawTargetModel ?? 'flux-2-klein-9b'
    const mode: GenerationMode = rawMode ?? 'generate'

    const hasImages = Array.isArray(images) && images.length > 0
    const hasUserInputs = userInputs.description?.trim()

    if (!hasImages && !hasUserInputs) {
      return NextResponse.json(
        { error: 'Provide reference images or describe your concept to get started' },
        { status: 400 }
      )
    }

    if (mode === 'edit' && !hasImages) {
      return NextResponse.json(
        { error: 'Edit mode requires at least one reference image' },
        { status: 400 }
      )
    }

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

    let visualStyleCues: VisualStyleCues | undefined
    let creativeBrief: CreativeBrief | undefined

    // -----------------------------------------------------------------------
    // Step 1: Vision analysis — find connecting concepts across reference images
    // -----------------------------------------------------------------------
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
        visualStyleCues = parseJsonResponse<VisualStyleCues>(visionResponse)
      } catch {
        console.error('Vision analysis parse failed, continuing without style cues')
      }
    } else if (cachedVisionCues) {
      visualStyleCues = cachedVisionCues
    }

    // -----------------------------------------------------------------------
    // Step 2: Creative brief — locked production document
    // Skip if a cached brief was provided (e.g. from Art Direction)
    // -----------------------------------------------------------------------
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
        creativeBrief = parseJsonResponse<CreativeBrief>(briefResponse)
      } catch {
        console.error('Brief generation parse failed, continuing without brief')
      }
    }

    // Early return for Art Direction mode — brief only, no prompt derivation
    if (body.briefOnly) {
      return NextResponse.json({ creativeBrief, visualStyleCues })
    }

    // -----------------------------------------------------------------------
    // Step 3: Prompt generation — strict derivation from the brief
    // -----------------------------------------------------------------------
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

    const parsed = parseJsonResponse<{ prompts: Array<{ label: string; prompt: string; negativePrompt?: string }> }>(
      promptResponse
    )

    if (!Array.isArray(parsed.prompts) || parsed.prompts.length === 0) {
      return NextResponse.json(
        { error: 'Model returned no prompts. Please try again.' },
        { status: 500 }
      )
    }

    const response: GenerateResponse = {
      prompts: parsed.prompts,
      visualStyleCues,
      creativeBrief,
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
