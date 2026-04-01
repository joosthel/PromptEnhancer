/**
 * @file route.ts
 * POST /api/reformat — Reformats an existing prompt for a different target model.
 *
 * Takes a prompt written for one model and rewrites it for another, preserving the
 * exact same scene, subject, lighting, and mood while adapting format and length.
 * Calls MiniMax M2.5 via OpenRouter.
 */

import { NextRequest, NextResponse } from 'next/server'
import { callOpenRouter, parseJsonResponse } from '@/lib/openrouter'
import { buildReformatSystemPrompt, buildReformatUserMessage } from '@/lib/prompt-engine'
import { TargetModel } from '@/lib/model-profiles'

export const maxDuration = 60

/** Request body for the reformat endpoint. */
export interface ReformatRequest {
  prompt: string
  label: string
  fromModel: TargetModel
  toModel: TargetModel
}

/** Response body: the reformatted prompt text only. */
export interface ReformatResponse {
  prompt: string
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
    const body: ReformatRequest = await request.json()
    const { prompt, label, fromModel, toModel } = body

    if (!prompt?.trim()) {
      return NextResponse.json(
        { error: 'prompt is required.' },
        { status: 400 }
      )
    }

    if (!fromModel || !toModel) {
      return NextResponse.json(
        { error: 'Both fromModel and toModel are required.' },
        { status: 400 }
      )
    }

    if (fromModel === toModel) {
      return NextResponse.json(
        { error: 'fromModel and toModel must be different.' },
        { status: 400 }
      )
    }

    const userMessage = buildReformatUserMessage(prompt, label)

    const reformatResponse = await callOpenRouter({
      model: 'deepseek/deepseek-v3.2',
      apiKey,
      responseFormat: 'json_object',
      temperature: 0.3,
      top_p: 0.8,
      max_tokens: 2048,
      stop: ['\n\n\n'],
      messages: [
        { role: 'system', content: buildReformatSystemPrompt(fromModel, toModel) },
        { role: 'user', content: userMessage },
      ],
    })

    const parsed = parseJsonResponse<{ prompt: string }>(reformatResponse)

    if (!parsed.prompt?.trim()) {
      return NextResponse.json(
        { error: 'Model returned an empty prompt. Please try again.' },
        { status: 500 }
      )
    }

    const response: ReformatResponse = { prompt: parsed.prompt }
    return NextResponse.json(response)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'An unexpected error occurred'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
