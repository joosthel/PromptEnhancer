const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions'

export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }

export interface OpenRouterMessage {
  role: 'system' | 'user' | 'assistant'
  content: string | ContentPart[]
}

export interface OpenRouterOptions {
  model: string
  messages: OpenRouterMessage[]
  apiKey: string
  responseFormat?: 'json_object'
}

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
