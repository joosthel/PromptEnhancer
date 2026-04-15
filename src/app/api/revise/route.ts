/**
 * @file route.ts
 * POST /api/revise — Revises a single generated prompt in-place.
 *
 * Accepts the original prompt, its shot label, a plain-English revision instruction
 * and/or a fix category, optional history, and context (user inputs, visual style cues).
 * Calls MiniMax M2.5 with model-aware system prompt, returning the revised prompt text.
 */

import { NextRequest, NextResponse } from 'next/server'
import { callOpenRouterWithFallback, parseJsonResponse, TEXT_MODEL, TEXT_MODEL_FALLBACK, toApiErrorResponse } from '@/lib/openrouter'
import { SinglePromptResponseSchema } from '@/lib/schemas'
import { UserInputs, VisualStyleCues } from '@/lib/system-prompt'
import { buildRevisionSystemPrompt, buildRevisionUserMessage } from '@/lib/prompt-engine'
import { TargetModel, GenerationMode, VALID_TARGET_MODELS, VALID_GENERATION_MODES } from '@/lib/model-profiles'
import { rateLimit } from '@/lib/rate-limit'

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

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  const limit = rateLimit(ip)
  if (!limit.success) {
    return NextResponse.json(
      { error: 'Too many requests. Please wait a moment.' },
      { status: 429, headers: { 'Retry-After': '60' } }
    )
  }

  try {
    const body: ReviseRequest = await request.json()
    const { prompt, label, revisionNote, fixCategory, history, userInputs, visualStyleCues, targetModel: rawTargetModel, mode: rawMode } = body

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

    const reviseResponse = await callOpenRouterWithFallback({
      model: TEXT_MODEL,
      apiKey,
      responseFormat: 'json_object',
      temperature: 0.3,
      top_p: 0.8,
      max_tokens: 4096,
      timeoutMs: 50_000,
      messages: [
        { role: 'system', content: buildRevisionSystemPrompt(targetModel, mode) },
        { role: 'user', content: userMessage },
      ],
    }, TEXT_MODEL_FALLBACK)

    const parsed = parseJsonResponse(reviseResponse, SinglePromptResponseSchema)

    const response: ReviseResponse = { prompt: parsed.prompt }
    return NextResponse.json(response)
  } catch (error) {
    const { error: message, code, status } = toApiErrorResponse(error)
    return NextResponse.json({ error: message, code }, { status })
  }
}
