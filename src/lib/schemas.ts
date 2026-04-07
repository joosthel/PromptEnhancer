/**
 * @file schemas.ts
 * Zod schemas for runtime validation of LLM JSON responses.
 * Prevents malformed model output from crashing downstream code.
 */

import { z } from 'zod'

// ---------------------------------------------------------------------------
// Vision analysis response
// ---------------------------------------------------------------------------

export const VisualStyleCuesSchema = z.object({
  description: z.string().min(1),
  hexPalette: z.array(z.string()).min(1),
  cinematicKeywords: z.array(z.string()).default([]),
  atmosphere: z.string().default(''),
})

// ---------------------------------------------------------------------------
// Creative brief response
// ---------------------------------------------------------------------------

export const ConceptAssignmentSchema = z.object({
  concept: z.string().min(1),
  role: z.enum(['primary', 'supporting', 'atmosphere']).default('primary'),
  frame: z.number().int().min(1),
  fiveWordPitch: z.string().default(''),
  shotScale: z.string().default('medium'),
  cameraAngle: z.string().default('eye-level'),
  subjectPlacement: z.string().default('rule-of-thirds'),
  depthPlanes: z.string().default(''),
  energyState: z.string().default('static tension'),
  cameraToLight: z.string().default('side-lit'),
  emotionalIntent: z.string().default(''),
  framePriority: z.string().default('lighting'),
  sensoryHook: z.string().default(''),
})

export const CreativeBriefSchema = z.object({
  creativeVision: z.string().min(1),
  visualMetaphor: z.string().default(''),
  unexpectedElement: z.string().default(''),
  dominantCreativePriority: z.string().default('lighting'),
  concepts: z.array(ConceptAssignmentSchema).min(1),
  colorGrade: z.string().min(1),
  colorAnchors: z.array(z.string()).min(1),
  lightSource: z.string().default(''),
  materials: z.string().default(''),
  mood: z.string().default(''),
  subjectDirection: z.string().default(''),
  environmentDirection: z.string().default(''),
  visualMotifs: z.array(z.string()).default([]),
  narrativeArc: z.string().default(''),
  fullBrief: z.string().default(''),
})

// ---------------------------------------------------------------------------
// Prompt generation response
// ---------------------------------------------------------------------------

export const GeneratedPromptSchema = z.object({
  label: z.string().min(1),
  prompt: z.string().min(1),
  negativePrompt: z.string().optional(),
})

export const PromptsResponseSchema = z.object({
  prompts: z.array(GeneratedPromptSchema).min(1),
})

// ---------------------------------------------------------------------------
// Single prompt responses (enhance, revise, reformat)
// ---------------------------------------------------------------------------

export const SinglePromptResponseSchema = z.object({
  prompt: z.string().min(1),
})
