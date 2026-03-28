/**
 * @file route.ts
 * POST /api/revise — Revises a single generated prompt in-place.
 *
 * Accepts the original prompt, its shot label, a plain-English revision instruction
 * and/or a fix category, optional history, and context (user inputs, visual style cues).
 * Calls MiniMax M2.5 with model-aware system prompt, returning the revised prompt text.
 */

import { NextRequest, NextResponse } from 'next/server'
import { callOpenRouter, parseJsonResponse } from '@/lib/openrouter'
import { UserInputs, VisualStyleCues } from '@/lib/system-prompt'
import { buildRevisionSystemPrompt, buildRevisionUserMessage } from '@/lib/prompt-engine'
import { TargetModel, GenerationMode } from '@/lib/model-profiles'

export const maxDuration = 60

/** Request body for the revise endpoint. */
export interface ReviseRequest {
  prompt: string
  label: string
  revisionNote: string
  fixCategory?: string
  history?: Array<{ prompt: string; fix: string }>
  userInputs: UserInputs
  visualStyleCues?: VisualStyleCues
  targetModel?: TargetModel
  mode?: GenerationMode
}

/** Response body: the revised prompt text only. */
export interface ReviseResponse {
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
    const body: ReviseRequest = await request.json()
    const { prompt, label, revisionNote, fixCategory, history, userInputs, visualStyleCues, targetModel: rawTargetModel, mode: rawMode } = body
    const targetModel: TargetModel = rawTargetModel ?? 'flux-2-klein-9b'
    const mode: GenerationMode = rawMode ?? 'generate'

    if (!prompt?.trim()) {
      return NextResponse.json(
        { error: 'prompt is required.' },
        { status: 400 }
      )
    }

    if (!revisionNote?.trim() && !fixCategory?.trim()) {
      return NextResponse.json(
        { error: 'Either revisionNote or fixCategory is required.' },
        { status: 400 }
      )
    }

    const userMessage = buildRevisionUserMessage(
      prompt, label, revisionNote, fixCategory, history, userInputs, visualStyleCues
    )

    const reviseResponse = await callOpenRouter({
      model: 'deepseek/deepseek-v3.2',
      apiKey,
      responseFormat: 'json_object',
      messages: [
        { role: 'system', content: buildRevisionSystemPrompt(targetModel, mode) },
        { role: 'user', content: userMessage },
      ],
    })

    const parsed = parseJsonResponse<{ prompt: string }>(reviseResponse)

    if (!parsed.prompt?.trim()) {
      return NextResponse.json(
        { error: 'Model returned an empty prompt. Please try again.' },
        { status: 500 }
      )
    }

    const response: ReviseResponse = { prompt: parsed.prompt }
    return NextResponse.json(response)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'An unexpected error occurred'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
