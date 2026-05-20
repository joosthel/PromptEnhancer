/**
 * @file route.ts
 * POST /api/generate — Three-step pipeline: vision → creative brief → prompts.
 *
 * Thin wrapper: rate-limit, then delegate to runGenerate in src/lib/services.ts
 * (shared with the MCP server). briefOnly requests (Art Direction) return just the brief.
 */

import { NextRequest, NextResponse } from 'next/server'
import { toApiErrorResponse } from '@/lib/openrouter'
import { runGenerate, type GenerateRequest } from '@/lib/services'
import { rateLimit } from '@/lib/rate-limit'

export const maxDuration = 60

export type { GenerateRequest, GenerateResponse } from '@/lib/services'

export async function POST(request: NextRequest) {
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
    const result = await runGenerate(body)
    if (body.briefOnly) {
      return NextResponse.json({ creativeBrief: result.creativeBrief, visualStyleCues: result.visualStyleCues })
    }
    return NextResponse.json(result)
  } catch (error) {
    const { error: message, code, status } = toApiErrorResponse(error)
    return NextResponse.json({ error: message, code }, { status })
  }
}
