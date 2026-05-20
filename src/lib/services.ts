/**
 * @file services.ts
 * Core orchestration for the four prompt operations, extracted from the API
 * route handlers so both the REST routes and the MCP server share one code path.
 *
 * Each function validates input, calls OpenRouter, and returns the typed result.
 * It THROWS on error (ApiError or a validation Error) — callers map that to an
 * HTTP response (routes) or an MCP error (MCP tools).
 */

import {
  callOpenRouterWithFallback,
  parseJsonResponse,
  TEXT_MODEL,
  TEXT_MODEL_FALLBACK,
  analyzeImagesParallel,
  ValidationError,
  type ImagePayload,
} from './openrouter'
import {
  SinglePromptResponseSchema,
  CreativeBriefSchema,
  PromptsResponseSchema,
} from './schemas'
import type { UserInputs, VisualStyleCues, ImageLabel, CreativeBrief } from './system-prompt'
import {
  buildEnhanceSystemPrompt,
  buildEnhanceUserMessage,
  buildSystemPrompt,
  buildUserMessage,
  BRIEF_SYSTEM_PROMPT,
  buildBriefUserMessage,
  buildRevisionSystemPrompt,
  buildRevisionUserMessage,
  buildReformatSystemPrompt,
  buildReformatUserMessage,
} from './prompt-engine'
import {
  type TargetModel,
  type GenerationMode,
  VALID_TARGET_MODELS,
  VALID_GENERATION_MODES,
} from './model-profiles'

// ---------------------------------------------------------------------------
// Shared types (moved here from the route files so routes + MCP both import them)
// ---------------------------------------------------------------------------

export type ImageInput =
  | { type: 'base64'; data: string; mimeType: string }
  | { type: 'url'; url: string }

export interface EnhanceRequest {
  prompt: string
  images?: ImageInput[]
  targetModel?: TargetModel
  mode?: GenerationMode
  imageLabels?: ImageLabel[]
  cachedVisionCues?: VisualStyleCues
}

export interface EnhanceResponse {
  prompt: string
  visualStyleCues?: VisualStyleCues
  targetModel: TargetModel
  mode: GenerationMode
}

export interface GenerateRequest {
  images: ImageInput[]
  userInputs: UserInputs
  promptCount: number
  targetModel?: TargetModel
  mode?: GenerationMode
  imageLabels?: ImageLabel[]
  cachedVisionCues?: VisualStyleCues
  cachedBrief?: CreativeBrief
  briefOnly?: boolean
}

export interface GenerateResponse {
  prompts: Array<{ label: string; prompt: string; negativePrompt?: string }>
  visualStyleCues?: VisualStyleCues
  creativeBrief?: CreativeBrief
  targetModel: TargetModel
  mode: GenerationMode
}

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

export interface ReviseResponse {
  prompt: string
}

export interface ReformatRequest {
  prompt: string
  label: string
  fromModel: TargetModel
  toModel: TargetModel
}

export interface ReformatResponse {
  prompt: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function requireApiKey(): string {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey?.trim()) {
    throw new ValidationError('OPENROUTER_API_KEY is not set. Add it to your .env.local file.')
  }
  return apiKey
}

function validateModelAndMode(rawTargetModel?: string, rawMode?: string): void {
  if (rawTargetModel && !VALID_TARGET_MODELS.has(rawTargetModel)) {
    throw new ValidationError('Invalid target model.')
  }
  if (rawMode && !VALID_GENERATION_MODES.has(rawMode)) {
    throw new ValidationError('Invalid generation mode.')
  }
}

function validateImages(images?: ImageInput[]): boolean {
  const hasImages = Array.isArray(images) && images.length > 0
  if (!hasImages) return false
  if (images!.length > 6) {
    throw new ValidationError('Maximum 6 reference images.')
  }
  for (const img of images!) {
    if (img.type === 'base64' && img.data.length > 4_000_000) {
      throw new ValidationError('Image too large after compression. Try a smaller source image.')
    }
  }
  return true
}

// ---------------------------------------------------------------------------
// enhance
// ---------------------------------------------------------------------------

export async function runEnhance(input: EnhanceRequest): Promise<EnhanceResponse> {
  const apiKey = requireApiKey()
  validateModelAndMode(input.targetModel, input.mode)

  const targetModel: TargetModel = input.targetModel ?? 'flux-2-klein-9b'
  const mode: GenerationMode = input.mode ?? 'generate'

  if (!input.prompt?.trim()) {
    throw new ValidationError('Paste a prompt to enhance.')
  }

  const hasImages = validateImages(input.images)

  let visualStyleCues: VisualStyleCues | undefined
  if (hasImages && !input.cachedVisionCues) {
    const { cues } = await analyzeImagesParallel(input.images as ImagePayload[], apiKey, 20_000)
    visualStyleCues = cues
  } else if (input.cachedVisionCues) {
    visualStyleCues = input.cachedVisionCues
  }

  const userMessage = buildEnhanceUserMessage(input.prompt, targetModel, mode, visualStyleCues, input.imageLabels)

  const enhanceResponse = await callOpenRouterWithFallback({
    model: TEXT_MODEL,
    apiKey,
    responseFormat: 'json_object',
    temperature: 0.4,
    top_p: 0.85,
    max_tokens: 4096,
    timeoutMs: 25_000,
    messages: [
      { role: 'system', content: buildEnhanceSystemPrompt(targetModel, mode) },
      { role: 'user', content: userMessage },
    ],
  }, TEXT_MODEL_FALLBACK)

  const parsed = parseJsonResponse(enhanceResponse, SinglePromptResponseSchema)

  return { prompt: parsed.prompt, visualStyleCues, targetModel, mode }
}

// ---------------------------------------------------------------------------
// generate (vision -> brief -> prompts; supports briefOnly for Art Direction)
// ---------------------------------------------------------------------------

export async function runGenerate(input: GenerateRequest): Promise<GenerateResponse> {
  const apiKey = requireApiKey()
  validateModelAndMode(input.targetModel, input.mode)

  const targetModel: TargetModel = input.targetModel ?? 'flux-2-klein-9b'
  const mode: GenerationMode = input.mode ?? 'generate'

  const hasImages = validateImages(input.images)
  const hasUserInputs = Boolean(input.userInputs?.description?.trim())

  if (!hasImages && !hasUserInputs) {
    throw new ValidationError('Provide reference images or describe your concept to get started')
  }
  if (mode === 'edit' && !hasImages) {
    throw new ValidationError('Edit mode requires at least one reference image')
  }

  let visualStyleCues: VisualStyleCues | undefined
  let creativeBrief: CreativeBrief | undefined

  // Step 1: vision analysis
  if (hasImages && !input.cachedVisionCues) {
    const { cues } = await analyzeImagesParallel(input.images as ImagePayload[], apiKey, 25_000)
    visualStyleCues = cues
  } else if (input.cachedVisionCues) {
    visualStyleCues = input.cachedVisionCues
  }

  // Step 2: creative brief (skipped if a cached brief is supplied)
  if (input.cachedBrief) {
    creativeBrief = input.cachedBrief
  } else if (mode === 'generate' || mode === 'video' || (mode === 'edit' && hasUserInputs)) {
    const briefUserMessage = buildBriefUserMessage(input.userInputs, mode, input.promptCount, visualStyleCues, input.imageLabels)

    const briefOptions = {
      model: TEXT_MODEL,
      apiKey,
      responseFormat: 'json_object' as const,
      temperature: 0.3,
      top_p: 0.85,
      max_tokens: 8192,
      timeoutMs: 50_000,
      messages: [
        { role: 'system' as const, content: BRIEF_SYSTEM_PROMPT },
        { role: 'user' as const, content: briefUserMessage },
      ],
    }

    for (let briefAttempt = 0; briefAttempt < 2; briefAttempt++) {
      try {
        const briefResponse = await callOpenRouterWithFallback(
          briefAttempt === 0 ? briefOptions : { ...briefOptions, temperature: 0.15 },
          TEXT_MODEL_FALLBACK,
        )
        creativeBrief = parseJsonResponse(briefResponse, CreativeBriefSchema)
        break
      } catch (e) {
        console.error(`Brief attempt ${briefAttempt + 1} failed:`, e instanceof Error ? e.message : e)
      }
    }
  }

  // Early return for Art Direction — brief only, no prompt derivation
  if (input.briefOnly) {
    return { prompts: [], visualStyleCues, creativeBrief, targetModel, mode }
  }

  // Step 3: prompt generation
  const userMessage = buildUserMessage(
    input.userInputs, input.promptCount, targetModel, mode,
    visualStyleCues, input.imageLabels, creativeBrief,
  )

  const promptResponse = await callOpenRouterWithFallback({
    model: TEXT_MODEL,
    apiKey,
    responseFormat: 'json_object',
    temperature: 0.4,
    top_p: 0.85,
    max_tokens: 8192,
    timeoutMs: 50_000,
    messages: [
      { role: 'system', content: buildSystemPrompt(targetModel, mode, creativeBrief?.medium) },
      { role: 'user', content: userMessage },
    ],
  }, TEXT_MODEL_FALLBACK)

  const parsed = parseJsonResponse(promptResponse, PromptsResponseSchema)

  return { prompts: parsed.prompts, visualStyleCues, creativeBrief, targetModel, mode }
}

// ---------------------------------------------------------------------------
// revise
// ---------------------------------------------------------------------------

export async function runRevise(input: ReviseRequest): Promise<ReviseResponse> {
  const apiKey = requireApiKey()
  validateModelAndMode(input.targetModel, input.mode)

  const targetModel: TargetModel = input.targetModel ?? 'flux-2-klein-9b'
  const mode: GenerationMode = input.mode ?? 'generate'

  if (!input.prompt?.trim()) {
    throw new ValidationError('prompt is required.')
  }
  if (!input.revisionNote?.trim() && !input.fixCategory?.trim()) {
    throw new ValidationError('Either revisionNote or fixCategory is required.')
  }

  const userMessage = buildRevisionUserMessage(
    input.prompt, input.label, input.revisionNote, input.fixCategory, input.history, input.userInputs, input.visualStyleCues,
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
  return { prompt: parsed.prompt }
}

// ---------------------------------------------------------------------------
// reformat
// ---------------------------------------------------------------------------

export async function runReformat(input: ReformatRequest): Promise<ReformatResponse> {
  const apiKey = requireApiKey()

  if (!input.prompt?.trim()) {
    throw new ValidationError('prompt is required.')
  }
  if (!input.fromModel || !input.toModel) {
    throw new ValidationError('Both fromModel and toModel are required.')
  }
  if (!VALID_TARGET_MODELS.has(input.fromModel) || !VALID_TARGET_MODELS.has(input.toModel)) {
    throw new ValidationError('Invalid target model.')
  }
  if (input.fromModel === input.toModel) {
    throw new ValidationError('fromModel and toModel must be different.')
  }

  const userMessage = buildReformatUserMessage(input.prompt, input.label)

  const reformatResponse = await callOpenRouterWithFallback({
    model: TEXT_MODEL,
    apiKey,
    responseFormat: 'json_object',
    temperature: 0.3,
    top_p: 0.8,
    max_tokens: 4096,
    timeoutMs: 50_000,
    messages: [
      { role: 'system', content: buildReformatSystemPrompt(input.fromModel, input.toModel) },
      { role: 'user', content: userMessage },
    ],
  }, TEXT_MODEL_FALLBACK)

  const parsed = parseJsonResponse(reformatResponse, SinglePromptResponseSchema)
  return { prompt: parsed.prompt }
}
