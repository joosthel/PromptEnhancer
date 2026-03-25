/**
 * @file prompt-engine.ts
 * Model-aware prompt builder. Wraps the original system-prompt logic with
 * model-specific rules, fix-category instructions, and reformat capabilities.
 */

import {
  TargetModel,
  MODEL_PROFILES,
  FIX_CATEGORIES,
} from './model-profiles'
import type { UserInputs, VisualStyleCues } from './system-prompt'
import { GEMINI_VISION_PROMPT } from './system-prompt'

export { GEMINI_VISION_PROMPT }

// ---------------------------------------------------------------------------
// System prompt — model-aware
// ---------------------------------------------------------------------------

export function buildSystemPrompt(targetModel: TargetModel): string {
  const profile = MODEL_PROFILES[targetModel]

  const base = `You are a ${profile.category === 'video' ? 'video' : 'image'} prompt writer working in the mode of a senior Director of Photography briefing a camera operator. Your default register is photorealistic cinematic — grounded, specific, and technically informed. Think Denis Villeneuve's restraint, Roger Deakins' mastery of practical and available light, David Lynch's quiet sense of wrongness. Never a fantasy novel.

TARGET MODEL: ${profile.label}
${profile.promptRules}

PROMPT STRUCTURE:
1. Each prompt: [cinematic_descriptor] [subject+action] [environment] [lighting_details] [camera_specs]
2. Length: ${profile.optimalLengthMin}-${profile.optimalLengthMax} words per prompt.
3. Each prompt must use a different camera angle from: Wide Establishing Shot / Medium Shot / Close-Up Portrait / Low-Angle Dramatic / High-Angle Overview / Dutch Angle

VISUAL COHERENCE ACROSS THE SET:
All prompts must read as frames from the same film. Enforce through:
- COLOR CONSISTENCY: Single dominant color temperature and tonal grade. Every prompt references the same base palette.
- RECURRING VISUAL MOTIFS: Thread 2-3 physical motifs across prompts (a material, a light behavior, a texture).
- LIGHTING CONTINUITY: Same time of day, weather, dominant light source across all shots.
- SYMBOLIC THREAD: Let the visual language escalate to match the emotional arc.

ARTIFACT PREVENTION:
- When hands are visible, specify "five fingers on each hand" and what the hands are doing
- Never combine contradictory modifiers (e.g., "close-up wide-angle", "bright dark")
- Avoid text/typography in the image — flag for post-production
- Avoid the "AI look": over-saturated colors, plastic skin, impossibly clean environments
- Ground every element in physical reality — specify materials, weathering, wear
- Limit each prompt to 3-5 primary visual concepts
- Specify relative scale when multiple subjects are present

NATURALISM VOCABULARY (use to counter synthetic look):
- Surface: scuffed, patina'd, rain-spotted, sun-faded, dust-settled, fingerprint-smudged
- Skin: pores visible, uneven tone, slight sheen, natural blemishes, micro-wrinkles
- Environment: asymmetric, slightly cluttered, lived-in, imperfect, worn edges
- Light: uneven falloff, color cast from environment, accidental spill, motivated shadows

DYNAMIC INPUT ADAPTATION:
- ALL four inputs provided: treat as hard constraints
- SOME inputs missing: fill gaps from visual reference or strongest provided input
- ONLY visual reference: extract narrative from image analysis
- ONLY text inputs: commit to a single unified cinematic look
- MOOD IS KING: mood inflects every technical choice

FORBIDDEN LANGUAGE (never use unless the user's own words contain them):
"ethereal", "dreamlike", "magical", "otherworldly", "surreal", "breathtaking",
"whimsical", "fantastical", "enchanted", "mystical", "stunning", "captivating",
"mesmerizing", "awe-inspiring", "hauntingly beautiful"

LENS AND LIGHTING VOCABULARY:
Lens: 21mm wide, 35mm standard, 50mm natural, 85mm portrait, 135mm compressed, anamorphic 2.39:1, tilt-shift
Light: overcast diffuse, tungsten practical, sodium vapour, golden hour side-rake, HMI through diffusion,
       bounce from concrete, chiaroscuro, motivated fill, fluorescent green-shift, push-processed underexposure,
       single-source top-light, dappled canopy light, mercury vapour blue-green, neon spill, backlit rim separation
Grade: bleach bypass, cross-processed, lifted blacks, crushed shadows, split-toned highlights, analog halation

WHEN VISUAL REFERENCE IS PROVIDED:
- Images define the visual language — replicate faithfully
- Weave cinematicKeywords naturally across prompts
- Reference hexPalette tones when describing color
- Where user inputs are absent, derive subject/environment from image description

COHERENCE VALIDATION (verify before returning):
- All prompts share identical color temperature and grade
- Shadow direction consistent across all shots
- Same film stock / lens family referenced
- Visual motifs appear in at least 2 of N prompts
- Emotional arc escalates from first to last shot
- No prompt falls outside ${profile.optimalLengthMin}-${profile.optimalLengthMax} words

OUTPUT: Return ONLY valid JSON:
{
  "prompts": [
    { "label": "Wide Establishing Shot", "prompt": "..." },
    { "label": "Medium Shot", "prompt": "..." }
  ]
}`

  return base
}

// ---------------------------------------------------------------------------
// User message — model-aware
// ---------------------------------------------------------------------------

export function buildUserMessage(
  userInputs: UserInputs,
  promptCount: number,
  targetModel: TargetModel,
  visualStyleCues?: VisualStyleCues
): string {
  const profile = MODEL_PROFILES[targetModel]
  const hasStoryline = userInputs.storyline.trim()
  const hasSubject = userInputs.subject.trim()
  const hasEnvironment = userInputs.environment.trim()
  const hasMood = userInputs.mood.trim()
  const hasAnyInput = hasStoryline || hasSubject || hasEnvironment || hasMood
  const hasVisual = !!visualStyleCues

  const lines: string[] = [
    `Generate exactly ${promptCount} ${profile.label} ${profile.category} generation prompts.`,
    `All ${promptCount} prompts must look like frames pulled from the same film — same color grade, same lighting world, same emotional register.`,
    `Target: ${profile.optimalLengthMin}-${profile.optimalLengthMax} words per prompt.`,
  ]

  if (hasVisual) {
    lines.push('\n=== VISUAL REFERENCE — PRIMARY VISUAL SOURCE ===')
    lines.push(visualStyleCues.description)
    lines.push(`\nColor Palette (use these exact tones): ${visualStyleCues.hexPalette.join(', ')}`)
    if (visualStyleCues.cinematicKeywords?.length > 0) {
      lines.push(`Cinematic Keywords (distribute across prompts): ${visualStyleCues.cinematicKeywords.join(' | ')}`)
    }
  } else {
    lines.push('\n=== VISUAL REFERENCE: None ===')
    lines.push('No moodboard provided. Commit to a single, specific visual language. Do not hedge between styles.')
  }

  lines.push('\n=== CREATIVE DIRECTION ===')
  if (hasStoryline) lines.push(`Storyline/Concept: ${userInputs.storyline}`)
  if (hasSubject) lines.push(`Subject: ${userInputs.subject}`)
  if (hasEnvironment) lines.push(`Environment: ${userInputs.environment}`)
  if (hasMood) lines.push(`Mood/Feeling: ${userInputs.mood}`)

  if (!hasAnyInput && hasVisual) {
    lines.push('(No text inputs — derive all from visual reference.)')
  } else if (!hasAnyInput && !hasVisual) {
    lines.push('(No inputs — generate a compelling cinematic sequence with clear visual identity.)')
  } else {
    const missing: string[] = []
    if (!hasStoryline) missing.push('storyline')
    if (!hasSubject) missing.push('subject')
    if (!hasEnvironment) missing.push('environment')
    if (!hasMood) missing.push('mood')
    if (missing.length > 0) {
      const source = hasVisual ? 'visual reference' : 'provided inputs'
      lines.push(`\n(Missing: ${missing.join(', ')} — infer from ${source}.)`)
    }
  }

  lines.push('\n=== COHERENCE CHECK ===')
  lines.push('Before finalizing: Do all prompts share the same color temperature, shadow behavior, and film stock? Could they be intercut without a jarring shift? If not, revise.')

  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// Revision — fix-category-aware, history-preserving
// ---------------------------------------------------------------------------

export function buildRevisionSystemPrompt(targetModel: TargetModel): string {
  const profile = MODEL_PROFILES[targetModel]
  return `You are correcting a specific issue in an existing ${profile.label} prompt. You are a senior Director of Photography making a surgical adjustment.

TARGET MODEL: ${profile.label}
${profile.promptRules}

REVISION RULES:
- Change the MINIMUM necessary to fix the issue
- Do NOT rewrite the entire prompt — surgical precision
- Preserve the voice, style, and structure of the original
- Keep the prompt within ${profile.optimalLengthMin}-${profile.optimalLengthMax} words
- Never introduce forbidden language (ethereal, dreamlike, magical, etc.)

OUTPUT: Return ONLY valid JSON: { "prompt": "..." }`
}

export function buildRevisionUserMessage(
  prompt: string,
  label: string,
  revisionNote: string,
  fixCategory: string | undefined,
  history: Array<{ prompt: string; fix: string }> | undefined,
  userInputs: UserInputs,
  visualStyleCues?: VisualStyleCues
): string {
  const lines: string[] = []

  // History-aware: tell the LLM what was already fixed
  if (history && history.length > 0) {
    lines.push('=== PREVIOUS FIXES (DO NOT undo these) ===')
    for (const h of history) {
      lines.push(`- Fixed: ${h.fix}`)
    }
    lines.push('')
  }

  lines.push(`Shot label: ${label}`)
  lines.push('')
  lines.push('=== CURRENT PROMPT ===')
  lines.push(prompt)
  lines.push('')

  // If it's a preset fix, use the detailed instruction
  if (fixCategory) {
    const cat = FIX_CATEGORIES.find(c => c.id === fixCategory)
    if (cat) {
      lines.push(`=== FIX CATEGORY: ${cat.label.toUpperCase()} ===`)
      lines.push(cat.instruction)
    }
  }

  // Always include the user's note (for custom fixes or additional context)
  if (revisionNote) {
    lines.push('')
    lines.push('=== REVISION INSTRUCTION ===')
    lines.push(revisionNote)
  }

  lines.push('')
  lines.push('=== SCENE CONTEXT (preserve unless instruction requires change) ===')
  if (userInputs.storyline.trim()) lines.push(`Storyline: ${userInputs.storyline}`)
  if (userInputs.subject.trim()) lines.push(`Subject: ${userInputs.subject}`)
  if (userInputs.environment.trim()) lines.push(`Environment: ${userInputs.environment}`)
  if (userInputs.mood.trim()) lines.push(`Mood: ${userInputs.mood}`)

  if (visualStyleCues) {
    lines.push('')
    lines.push('=== VISUAL REFERENCE ===')
    lines.push(visualStyleCues.description)
    lines.push(`Color Palette: ${visualStyleCues.hexPalette.join(', ')}`)
    if (visualStyleCues.cinematicKeywords?.length) {
      lines.push(`Keywords: ${visualStyleCues.cinematicKeywords.join(' | ')}`)
    }
  }

  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// Reformat — rewrite a prompt for a different model
// ---------------------------------------------------------------------------

export function buildReformatSystemPrompt(fromModel: TargetModel, toModel: TargetModel): string {
  const to = MODEL_PROFILES[toModel]
  return `You are reformatting an image generation prompt from ${MODEL_PROFILES[fromModel].label} to ${to.label}. Preserve the exact same scene, subject, lighting, and mood — change ONLY the prompt format and length to match the target model's requirements.

TARGET MODEL: ${to.label}
${to.promptRules}

REFORMAT RULES:
- Same scene, same subject, same lighting, same mood — different format
- Adjust length to ${to.optimalLengthMin}-${to.optimalLengthMax} words
- Apply model-specific syntax and vocabulary
- Do NOT add new creative elements or change the visual concept

OUTPUT: Return ONLY valid JSON: { "prompt": "..." }`
}

export function buildReformatUserMessage(prompt: string, label: string): string {
  return `Shot label: ${label}\n\n=== ORIGINAL PROMPT ===\n${prompt}\n\nReformat this prompt for the target model. Same scene, different format.`
}
