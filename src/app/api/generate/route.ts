import { NextRequest, NextResponse } from 'next/server'
import { callOpenRouter, parseJsonResponse, ContentPart } from '@/lib/openrouter'

export const maxDuration = 120 // Allow up to 2 minutes for the two-step pipeline
import {
  GEMINI_VISION_PROMPT,
  buildMiniMaxSystemPrompt,
  buildMiniMaxUserMessage,
  UserInputs,
  VisualStyleCues,
} from '@/lib/system-prompt'

export interface GenerateRequest {
  apiKey: string
  images: Array<
    { type: 'base64'; data: string; mimeType: string } | { type: 'url'; url: string }
  >
  userInputs: UserInputs
  promptCount: number
}

export interface GenerateResponse {
  prompts: Array<{ label: string; prompt: string }>
  visualStyleCues?: VisualStyleCues
}

export async function POST(request: NextRequest) {
  try {
    const body: GenerateRequest = await request.json()
    const { apiKey, images, userInputs, promptCount } = body

    if (!apiKey?.trim()) {
      return NextResponse.json({ error: 'API key is required' }, { status: 400 })
    }

    const hasImages = Array.isArray(images) && images.length > 0
    const hasUserInputs = Object.values(userInputs).some((v) => v?.trim())

    if (!hasImages && !hasUserInputs) {
      return NextResponse.json(
        { error: 'Provide reference images or describe your concept to get started' },
        { status: 400 }
      )
    }

    let visualStyleCues: VisualStyleCues | undefined

    // Step 1: Abstract vision analysis (only if images are provided)
    if (hasImages) {
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
        // Non-fatal: proceed without style cues if parsing fails
        console.error('Vision analysis parse failed, continuing without style cues')
      }
    }

    // Step 2: Prompt generation with MiniMax M2.5
    const userMessage = buildMiniMaxUserMessage(userInputs, promptCount, visualStyleCues)

    const promptResponse = await callOpenRouter({
      model: 'minimax/minimax-m2.5',
      apiKey,
      responseFormat: 'json_object',
      messages: [
        { role: 'system', content: buildMiniMaxSystemPrompt() },
        { role: 'user', content: userMessage },
      ],
    })

    const parsed = parseJsonResponse<{ prompts: Array<{ label: string; prompt: string }> }>(
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
    }

    return NextResponse.json(response)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'An unexpected error occurred'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
