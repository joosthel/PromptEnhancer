/**
 * @file openrouter.ts
 * Thin wrapper around the OpenRouter chat completions API.
 * Provides a typed fetch helper and a fault-tolerant JSON parser used by
 * all API routes (generate, revise).
 */

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions'

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
}

/**
 * Sends a chat completion request to OpenRouter and returns the raw text
 * content of the first choice. Applies a 90-second abort timeout.
 *
 * @throws {Error} If the HTTP response is not OK or the response body contains no content.
 */
export async function callOpenRouter(options: OpenRouterOptions): Promise<string> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 90_000)

  try {
    const response = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${options.apiKey}`,
        'HTTP-Referer': 'http://localhost:3000',
        'X-Title': 'PromptEnhancer',
      },
      body: JSON.stringify({
        model: options.model,
        messages: options.messages,
        ...(options.responseFormat && {
          response_format: { type: options.responseFormat },
        }),
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
      throw new Error('Empty response from OpenRouter')
    }

    return content
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * Parses a JSON string returned by a model, with three fallback strategies:
 * 1. Direct `JSON.parse` — handles well-formed responses
 * 2. Extracts from a ` ```json ... ``` ` code block — handles markdown-wrapped output
 * 3. Extracts the first `{ ... }` object found — handles responses with surrounding text
 *
 * @throws {Error} If none of the three strategies succeeds.
 */
export function parseJsonResponse<T>(text: string): T {
  try {
    return JSON.parse(text) as T
  } catch {
    const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (codeBlock) {
      return JSON.parse(codeBlock[1].trim()) as T
    }
    const jsonObject = text.match(/\{[\s\S]*\}/)
    if (jsonObject) {
      return JSON.parse(jsonObject[0]) as T
    }
    throw new Error('Could not parse JSON from model response')
  }
}
