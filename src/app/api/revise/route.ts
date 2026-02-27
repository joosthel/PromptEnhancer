/**
 * @file route.ts
 * POST /api/revise — Revises a single generated prompt in-place.
 *
 * Accepts the original prompt, its shot label, a plain-English revision instruction,
 * and optional context (user inputs, visual style cues). Calls MiniMax M2.5 with
 * the same DoP system voice used during generation, returning only the revised prompt text.
 */

import { NextRequest, NextResponse } from 'next/server'
import { callOpenRouter, parseJsonResponse } from '@/lib/openrouter'
import { buildMiniMaxSystemPrompt, UserInputs, VisualStyleCues } from '@/lib/system-prompt'

export const maxDuration = 60 // Single model call — no vision step needed

/** Request body for the revise endpoint. */
export interface ReviseRequest {
  prompt: string
  label: string
  revisionNote: string
  userInputs: UserInputs
  visualStyleCues?: VisualStyleCues
}

/** Response body: the revised prompt text only. */
export interface ReviseResponse {
  prompt: string
}

/**
 * Builds the user-turn message for the MiniMax revision call.
 * Provides the original prompt, revision instruction, and original scene context
 * so the model changes only what the instruction requires.
 */
function buildReviseUserMessage(
  prompt: string,
  label: string,
  revisionNote: string,
  userInputs: UserInputs,
  visualStyleCues?: VisualStyleCues
): string {
  const lines: string[] = [
    'Revise the following Flux 2 [pro] prompt according to the revision instruction.',
    'Return ONLY valid JSON: { "prompt": "..." }',
    `Shot label: ${label}`,
    '',
    '=== ORIGINAL PROMPT ===',
    prompt,
    '',
    '=== REVISION INSTRUCTION ===',
    revisionNote,
    '',
    '=== ORIGINAL SCENE CONTEXT (do not change unless the instruction requires it) ===',
  ]

  if (userInputs.storyline.trim()) lines.push(`Storyline/Concept: ${userInputs.storyline}`)
  if (userInputs.subject.trim()) lines.push(`Subject: ${userInputs.subject}`)
  if (userInputs.environment.trim()) lines.push(`Environment: ${userInputs.environment}`)
  if (userInputs.mood.trim()) lines.push(`Mood/Feeling: ${userInputs.mood}`)

  if (visualStyleCues) {
    lines.push('')
    lines.push('=== VISUAL REFERENCE (from user-selected images) ===')
    lines.push(visualStyleCues.description)
    lines.push(`Color Palette: ${visualStyleCues.hexPalette.join(', ')}`)
    if (visualStyleCues.cinematicKeywords?.length) {
      lines.push(`Cinematic Keywords: ${visualStyleCues.cinematicKeywords.join(' | ')}`)
    }
  }

  return lines.join('\n')
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
    const { prompt, label, revisionNote, userInputs, visualStyleCues } = body

    if (!prompt?.trim() || !revisionNote?.trim()) {
      return NextResponse.json(
        { error: 'Both prompt and revisionNote are required.' },
        { status: 400 }
      )
    }

    const userMessage = buildReviseUserMessage(prompt, label, revisionNote, userInputs, visualStyleCues)

    const reviseResponse = await callOpenRouter({
      model: 'minimax/minimax-m2.5',
      apiKey,
      responseFormat: 'json_object',
      messages: [
        { role: 'system', content: buildMiniMaxSystemPrompt() },
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
