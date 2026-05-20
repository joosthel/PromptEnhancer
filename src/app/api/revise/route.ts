/**
 * @file route.ts
 * POST /api/revise — Revises a single generated prompt in-place.
 *
 * Thin wrapper: rate-limit, then delegate to runRevise in src/lib/services.ts
 * (shared with the MCP server).
 */

import { NextRequest, NextResponse } from 'next/server'
import { toApiErrorResponse } from '@/lib/openrouter'
import { runRevise, type ReviseRequest } from '@/lib/services'
import { rateLimit } from '@/lib/rate-limit'

export const maxDuration = 60

export type { ReviseRequest, ReviseResponse } from '@/lib/services'

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
    const body: ReviseRequest = await request.json()
    return NextResponse.json(await runRevise(body))
  } catch (error) {
    const { error: message, code, status } = toApiErrorResponse(error)
    return NextResponse.json({ error: message, code }, { status })
  }
}
