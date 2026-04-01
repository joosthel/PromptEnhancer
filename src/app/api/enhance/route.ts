/**
 * @file route.ts
 * POST /api/enhance — Takes a raw prompt and optimizes it for the target model.
 *
 * Optional: if reference images were uploaded, runs Gemini vision first to extract
 * visual style cues, then uses them as a style guide during enhancement.
 */

import { NextRequest, NextResponse } from 'next/server'
import { callOpenRouter, parseJsonResponse, ContentPart } from '@/lib/openrouter'
import { GEMINI_VISION_PROMPT, UserInputs, VisualStyleCues } from '@/lib/system-prompt'
import { buildEnhanceSystemPrompt, buildEnhanceUserMessage } from '@/lib/prompt-engine'
import { TargetModel, GenerationMode } from '@/lib/model-profiles'
import { ImageLabel } from '@/lib/system-prompt'

export const maxDuration = 180

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

  try {
    const body: EnhanceRequest = await request.json()
    const { prompt, images, targetModel: rawTargetModel, mode: rawMode, imageLabels, cachedVisionCues } = body
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

      const visionResponse = await callOpenRouter({
        model: 'google/gemini-2.5-flash',
        apiKey,
        responseFormat: 'json_object',
        messages: [{ role: 'user', content: visionContent }],
      })

      try {
        visualStyleCues = parseJsonResponse<VisualStyleCues>(visionResponse)
      } catch {
        console.error('Vision analysis parse failed, continuing without style cues')
      }
    } else if (cachedVisionCues) {
      visualStyleCues = cachedVisionCues
    }

    // Step 2: Enhance the prompt
    const userMessage = buildEnhanceUserMessage(prompt, targetModel, mode, visualStyleCues, imageLabels)

    const enhanceResponse = await callOpenRouter({
      model: 'deepseek/deepseek-v3.2',
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
    })

    const parsed = parseJsonResponse<{ prompt: string }>(enhanceResponse)

    if (!parsed.prompt?.trim()) {
      return NextResponse.json(
        { error: 'Model returned an empty prompt. Please try again.' },
        { status: 500 }
      )
    }

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
