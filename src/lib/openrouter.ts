/**
 * @file openrouter.ts
 * Thin wrapper around the OpenRouter chat completions API.
 * Provides a typed fetch helper and a fault-tolerant JSON parser used by
 * all API routes (generate, revise).
 */

import { z } from 'zod'

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions'

/** Centralized model constants — change here to swap models globally. */
export const TEXT_MODEL = 'deepseek/deepseek-v3.2'
export const TEXT_MODEL_FALLBACK = 'qwen/qwen3.6-plus:free'
export const VISION_MODEL = 'google/gemini-2.5-flash'
export const VISION_MODEL_FALLBACK = 'google/gemma-4-31b-it'

/** A single content part in a multimodal message — either plain text or an image URL. */
export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }

/** A single message in the OpenRouter conversation format. */
export interface OpenRouterMessage {
  role: 'system' | 'user' | 'assistant'
  content: string | ContentPart[]
}

/** Options passed to {@link callOpenRouter}. */
export interface OpenRouterOptions {
  model: string
  messages: OpenRouterMessage[]
  apiKey: string
  /** When set to 'json_object', instructs the model to return valid JSON. */
  responseFormat?: 'json_object'
  /** Sampling temperature. Lower = more deterministic. */
  temperature?: number
  /** Nucleus sampling. Lower = more focused. */
  top_p?: number
  /** Maximum tokens in the response. Prevents mid-stream JSON truncation. */
  max_tokens?: number
  /** Stop sequences to prevent trailing text after JSON. */
  stop?: string[]
  /** Per-call timeout in ms. Defaults to 50_000 (50s) to fit inside Vercel's 60s limit. */
  timeoutMs?: number
}

/**
 * Sends a chat completion request to OpenRouter and returns the raw text
 * content of the first choice.
 *
 * Timeout defaults to 50s so it completes well inside Vercel's 60s function limit.
 * The generate-stream route passes a higher value for its 120s budget.
 *
 * @throws {Error} If the HTTP response is not OK or the response body contains no content.
 */
export async function callOpenRouter(options: OpenRouterOptions): Promise<string> {
  const MAX_RETRIES = 2
  const timeoutMs = options.timeoutMs ?? 50_000

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)

    try {
      const response = await fetch(OPENROUTER_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${options.apiKey}`,
          'HTTP-Referer': process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000',
          'X-Title': 'PromptEnhancer',
        },
        body: JSON.stringify({
          model: options.model,
          messages: options.messages,
          ...(options.responseFormat && {
            response_format: { type: options.responseFormat },
          }),
          ...(options.temperature !== undefined && { temperature: options.temperature }),
          ...(options.top_p !== undefined && { top_p: options.top_p }),
          ...(options.max_tokens !== undefined && { max_tokens: options.max_tokens }),
          ...(options.stop && { stop: options.stop }),
        }),
        signal: controller.signal,
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`OpenRouter API error ${response.status}: ${errorText}`)
      }

      const data = await response.json()
      const content = data.choices?.[0]?.message?.content

      if (!content) {
        if (attempt < MAX_RETRIES) {
          clearTimeout(timeout)
          continue
        }
        throw new Error('Empty response from OpenRouter')
      }

      return content
    } catch (error) {
      clearTimeout(timeout)
      // Surface a clear message when the request was aborted by our timeout
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new Error(`AI model timed out after ${Math.round(timeoutMs / 1000)}s. Try again — this usually resolves on retry.`)
      }
      // Only retry on empty responses, not on API errors or aborts
      if (attempt < MAX_RETRIES && error instanceof Error && error.message === 'Empty response from OpenRouter') {
        continue
      }
      throw error
    } finally {
      clearTimeout(timeout)
    }
  }

  throw new Error('Empty response from OpenRouter after retries')
}

/**
 * Wraps {@link callOpenRouter} with automatic model fallback.
 * If the primary model fails for any reason, retries the same request
 * with the specified fallback model.
 */
export async function callOpenRouterWithFallback(
  options: OpenRouterOptions,
  fallbackModel: string
): Promise<string> {
  try {
    return await callOpenRouter(options)
  } catch (error) {
    console.warn(`Primary model ${options.model} failed, trying fallback ${fallbackModel}:`, error instanceof Error ? error.message : error)
    return await callOpenRouter({ ...options, model: fallbackModel })
  }
}

/**
 * Extracts a JSON object from model output using three fallback strategies:
 * 1. Direct `JSON.parse` — handles well-formed responses
 * 2. Extracts from a ` ```json ... ``` ` code block — handles markdown-wrapped output
 * 3. Extracts the first `{ ... }` object found — handles responses with surrounding text
 */
function extractJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (codeBlock) {
      return JSON.parse(codeBlock[1].trim())
    }
    const jsonObject = text.match(/\{[\s\S]*\}/)
    if (jsonObject) {
      return JSON.parse(jsonObject[0])
    }
    throw new Error('Could not parse JSON from model response')
  }
}

/**
 * Parses a JSON string and validates it against a Zod schema.
 * Uses three fallback extraction strategies, then validates the shape.
 *
 * @throws {Error} If extraction or validation fails.
 */
export function parseJsonResponse<T>(text: string, schema: z.ZodType<T>): T {
  const raw = extractJson(text)
  const result = schema.safeParse(raw)
  if (!result.success) {
    const issues = result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')
    throw new Error(`Invalid model response shape: ${issues}`)
  }
  return result.data
}

/**
 * Legacy overload: parses JSON without schema validation (unsafe cast).
 * @deprecated Use the schema-validated overload instead.
 */
export function parseJsonResponseUnsafe<T>(text: string): T {
  return extractJson(text) as T
}

// ---------------------------------------------------------------------------
// Parallel per-image vision analysis
// ---------------------------------------------------------------------------

import { GEMINI_VISION_PROMPT, type VisualStyleCues } from './system-prompt'
import { VisualStyleCuesSchema } from './schemas'

/** Image payload as sent by the client. */
export type ImagePayload =
  | { type: 'base64'; data: string; mimeType: string }
  | { type: 'url'; url: string }

function imageToContentPart(img: ImagePayload): ContentPart {
  if (img.type === 'base64') {
    return { type: 'image_url', image_url: { url: `data:${img.mimeType};base64,${img.data}` } }
  }
  return { type: 'image_url', image_url: { url: img.url } }
}

/**
 * Analyzes images in parallel (one API call per image) and merges results.
 * Much more resilient than sending all images in one massive request:
 * - Individual failures don't block others
 * - Smaller payloads per request = fewer timeouts
 * - Parallel execution = faster than sequential
 *
 * Returns merged VisualStyleCues, or undefined if all images fail.
 */
export async function analyzeImagesParallel(
  images: ImagePayload[],
  apiKey: string,
  timeoutMs: number = 30_000,
): Promise<{ cues: VisualStyleCues | undefined; failCount: number }> {
  // Single image: send directly (no merge overhead)
  if (images.length === 1) {
    try {
      const response = await callOpenRouterWithFallback({
        model: VISION_MODEL,
        apiKey,
        responseFormat: 'json_object',
        timeoutMs,
        messages: [{
          role: 'user',
          content: [imageToContentPart(images[0]), { type: 'text', text: GEMINI_VISION_PROMPT }],
        }],
      }, VISION_MODEL_FALLBACK)
      return { cues: parseJsonResponse(response, VisualStyleCuesSchema), failCount: 0 }
    } catch (e) {
      console.error('Vision analysis failed:', e instanceof Error ? e.message : e)
      return { cues: undefined, failCount: 1 }
    }
  }

  // Multiple images: analyze each in parallel
  const results = await Promise.allSettled(
    images.map(async (img) => {
      const response = await callOpenRouterWithFallback({
        model: VISION_MODEL,
        apiKey,
        responseFormat: 'json_object',
        timeoutMs,
        messages: [{
          role: 'user',
          content: [imageToContentPart(img), { type: 'text', text: GEMINI_VISION_PROMPT }],
        }],
      }, VISION_MODEL_FALLBACK)
      return parseJsonResponse(response, VisualStyleCuesSchema)
    })
  )

  const successful = results
    .filter((r): r is PromiseFulfilledResult<VisualStyleCues> => r.status === 'fulfilled')
    .map(r => r.value)
  const failCount = results.length - successful.length

  if (successful.length === 0) {
    return { cues: undefined, failCount }
  }

  // Merge: combine descriptions (capped), deduplicate keywords/palette, pick majority medium
  // Cap each description to ~150 words to prevent the downstream brief prompt from exploding
  const cappedDescriptions = successful.map((c, i) => {
    const words = c.description.split(/\s+/)
    const trimmed = words.length > 150 ? words.slice(0, 150).join(' ') + '...' : c.description
    return `[Image ${i + 1}] ${trimmed}`
  })
  const merged: VisualStyleCues = {
    description: cappedDescriptions.join('\n\n'),
    mediumType: pickMajority(successful.map(c => c.mediumType)) ?? successful[0].mediumType,
    mediumDetail: successful.map(c => c.mediumDetail).filter(Boolean).join('; '),
    hexPalette: deduplicateColors(successful.flatMap(c => c.hexPalette)).slice(0, 8),
    visualKeywords: [...new Set(successful.flatMap(c => c.visualKeywords))].slice(0, 15),
    atmosphere: successful.map(c => c.atmosphere).filter(Boolean).join(' '),
  }

  return { cues: merged, failCount }
}

/** Returns the most common value, or undefined if empty. */
function pickMajority<T>(values: T[]): T | undefined {
  const counts = new Map<T, number>()
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1)
  let best: T | undefined
  let bestCount = 0
  for (const [v, c] of counts) {
    if (c > bestCount) { best = v; bestCount = c }
  }
  return best
}

/** Deduplicates hex colors, treating similar shades (distance < 30) as the same. */
function deduplicateColors(hexes: string[]): string[] {
  const result: string[] = []
  for (const hex of hexes) {
    const rgb = hexToRgb(hex)
    if (!rgb) continue
    const isDupe = result.some(existing => {
      const eRgb = hexToRgb(existing)
      return eRgb && colorDistance(rgb, eRgb) < 30
    })
    if (!isDupe) result.push(hex)
  }
  return result
}

function hexToRgb(hex: string): [number, number, number] | null {
  const m = hex.match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i)
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : null
}

function colorDistance(a: [number, number, number], b: [number, number, number]): number {
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2)
}
