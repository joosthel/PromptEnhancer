/**
 * @file route.ts
 * POST /api/reformat — Reformats an existing prompt for a different target model.
 *
 * Thin wrapper: rate-limit, then delegate to runReformat in src/lib/services.ts
 * (shared with the MCP server).
 */

import { NextRequest, NextResponse } from 'next/server'
import { toApiErrorResponse } from '@/lib/openrouter'
import { runReformat, type ReformatRequest } from '@/lib/services'
import { rateLimit } from '@/lib/rate-limit'

export const maxDuration = 60

export type { ReformatRequest, ReformatResponse } from '@/lib/services'

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
    const body: ReformatRequest = await request.json()
    return NextResponse.json(await runReformat(body))
  } catch (error) {
    const { error: message, code, status } = toApiErrorResponse(error)
    return NextResponse.json({ error: message, code }, { status })
  }
}
