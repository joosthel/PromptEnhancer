/**
 * @file prompt-engine.ts
 * Mode-aware, model-specific prompt builder.
 * Handles three generation modes: generate (txt2img), edit (img2img), video.
 */

import {
  TargetModel,
  GenerationMode,
  MODEL_PROFILES,
  FIX_CATEGORIES,
} from './model-profiles'
import type { UserInputs, VisualStyleCues, ImageLabel } from './system-prompt'
import { GEMINI_VISION_PROMPT } from './system-prompt'

export { GEMINI_VISION_PROMPT }

// ---------------------------------------------------------------------------
// Shared vocabulary blocks
// ---------------------------------------------------------------------------

const FORBIDDEN_LANGUAGE = `FORBIDDEN LANGUAGE (never use unless the user's own words contain them):
"ethereal", "dreamlike", "magical", "otherworldly", "surreal", "breathtaking",
"whimsical", "fantastical", "enchanted", "mystical", "stunning", "captivating",
"mesmerizing", "awe-inspiring", "hauntingly beautiful"`

const NATURALISM_VOCABULARY = `NATURALISM VOCABULARY (use to counter synthetic look):
- Surface: scuffed, patina'd, rain-spotted, sun-faded, dust-settled, fingerprint-smudged
- Skin: pores visible, uneven tone, slight sheen, natural blemishes, micro-wrinkles
- Environment: asymmetric, slightly cluttered, lived-in, imperfect, worn edges
- Light: uneven falloff, color cast from environment, accidental spill, motivated shadows`

const LENS_VOCABULARY = `LENS AND LIGHTING VOCABULARY:
Lens: 21mm wide, 35mm standard, 50mm natural, 85mm portrait, 135mm compressed, anamorphic 2.39:1, tilt-shift
Light: overcast diffuse, tungsten practical, sodium vapour, golden hour side-rake, HMI through diffusion,
       bounce from concrete, chiaroscuro, motivated fill, fluorescent green-shift, push-processed underexposure,
       single-source top-light, dappled canopy light, mercury vapour blue-green, neon spill, backlit rim separation
Grade: bleach bypass, cross-processed, lifted blacks, crushed shadows, split-toned highlights, analog halation`

// ---------------------------------------------------------------------------
// GENERATE mode — text-to-image system prompt
// ---------------------------------------------------------------------------

function buildGenerateSystemPrompt(targetModel: TargetModel): string {
  const profile = MODEL_PROFILES[targetModel]

  return `You are an image prompt writer working in the mode of a senior Director of Photography briefing a camera operator. Your default register is photorealistic cinematic — grounded, specific, and technically informed. Think Denis Villeneuve's restraint, Roger Deakins' mastery of practical and available light, David Lynch's quiet sense of wrongness. Never a fantasy novel.

TARGET MODEL: ${profile.label}
${profile.promptRules}

PROMPT STRUCTURE:
1. Each prompt: [cinematic_descriptor] [subject+action] [environment] [lighting_details] [camera_specs]
2. Length: ${profile.optimalLengthMin}-${profile.optimalLengthMax} words per prompt.
3. Each prompt must use a different camera angle from: Wide Establishing Shot / Medium Shot / Close-Up Portrait / Low-Angle Dramatic / High-Angle Overview / Dutch Angle

VISUAL COHERENCE ACROSS THE SET:
All prompts must read as frames from the same film. Enforce through:
- COLOR LOCK: Before writing any prompt, decide ONE specific color grade that applies to the entire set. State it as a concrete technical description (e.g., "desaturated cool tones, lifted blacks, blue-grey shadows with muted warm skin tones"). Then REPEAT this exact color grade description verbatim or near-verbatim in every single prompt. Do not paraphrase it differently each time — use the same color language.
- PALETTE ANCHORING: Pick 2-3 specific hex colors or named color references that appear in every prompt. Example: "slate blue (#5B7B8A) shadows, warm ivory (#F5E6D3) highlights, oxidized copper (#8B6914) accents". Reference these exact colors across all prompts.
- RECURRING VISUAL MOTIFS: Thread 2-3 physical motifs across prompts (a material, a light behavior, a texture).
- LIGHTING CONTINUITY: Same time of day, weather, dominant light source across all shots. Name the light source once and repeat it.
- SYMBOLIC THREAD: Let the visual language escalate to match the emotional arc.

BRAND AND DESIGNER REFERENCES:
When the user mentions fashion brands, designers, photographers, or other cultural references:
- TRANSLATE the reference into its concrete visual characteristics rather than naming the brand in the prompt
- "Jil Sander" → "minimalist tailoring, clean architectural lines, neutral palette, unfussy luxury, structured wool and cashmere, absence of visible branding"
- "Helmut Newton" → "high-contrast black and white, strong directional light, angular poses, polished surfaces, provocative confidence"
- This approach works because image models respond to VISUAL DESCRIPTIONS, not brand names. A model may not know "Jil Sander" but it understands "architectural minimalism in dove grey wool"
- If the user explicitly asks for brand names in prompts, include them — but always ALSO include the visual translation as the primary descriptor

ARTIFACT PREVENTION:
- When hands are visible, specify "five fingers on each hand" and what the hands are doing
- Never combine contradictory modifiers (e.g., "close-up wide-angle", "bright dark")
- Avoid text/typography in the image — flag for post-production
- Avoid the "AI look": over-saturated colors, plastic skin, impossibly clean environments
- Ground every element in physical reality — specify materials, weathering, wear
- Limit each prompt to 3-5 primary visual concepts
- Specify relative scale when multiple subjects are present

${NATURALISM_VOCABULARY}

${LENS_VOCABULARY}

${FORBIDDEN_LANGUAGE}

WHEN VISUAL REFERENCE IS PROVIDED:
- Images define the visual language — replicate faithfully
- Weave cinematicKeywords naturally across prompts
- Reference hexPalette tones when describing color
- Where user description is absent, derive subject/environment from image analysis

COHERENCE VALIDATION (verify before returning):
- Extract the color grade phrase from prompt 1. Does the EXACT same phrase appear in all other prompts? If not, fix it.
- Shadow direction consistent across all shots
- Same film stock / lens family referenced in every prompt
- Same 2-3 hex color anchors referenced in every prompt
- Visual motifs appear in at least 2 of N prompts
- Emotional arc escalates from first to last shot
- No prompt falls outside ${profile.optimalLengthMin}-${profile.optimalLengthMax} words
- If the user mentioned brands/designers: are they translated into visual descriptions, not left as brand names?

OUTPUT: Return ONLY valid JSON:
{
  "prompts": [
    { "label": "Wide Establishing Shot", "prompt": "..." },
    { "label": "Medium Shot", "prompt": "..." }
  ]
}`
}

// ---------------------------------------------------------------------------
// EDIT mode — image editing system prompt
// ---------------------------------------------------------------------------

function buildEditSystemPrompt(targetModel: TargetModel): string {
  const profile = MODEL_PROFILES[targetModel]
  const editRules = profile.editRules ?? ''

  return `You are writing image EDITING prompts. The user has reference images they want to modify. Your prompts must describe the DESIRED RESULT — not the transformation.

TARGET MODEL: ${profile.label}
${profile.promptRules}

${editRules ? editRules + '\n' : ''}EDIT PROMPT PRINCIPLES:
- Describe what the final image should look like, not "change X to Y"
- Be specific about what should change and what should be preserved
- One major change per prompt yields best quality
- Keep prompts focused — edit prompts should be shorter and more targeted than generation prompts
- Length: ${profile.optimalLengthMin}-${profile.optimalLengthMax} words per prompt
- Max reference images: ${profile.maxReferenceImages}

REFERENCE IMAGE AWARENESS:
- If the user labeled their reference images, incorporate those labels into the prompt context
- "style reference" → apply that image's visual style to the output
- "subject" / "face" → preserve that person/object in the new scene
- "background" → use as the environment, replace or modify the foreground
- Unlabeled references → infer purpose from the user's description

${FORBIDDEN_LANGUAGE}

OUTPUT: Return ONLY valid JSON:
{
  "prompts": [
    { "label": "Edit Variant A", "prompt": "..." },
    { "label": "Edit Variant B", "prompt": "..." }
  ]
}`
}

// ---------------------------------------------------------------------------
// VIDEO mode — video generation system prompt
// ---------------------------------------------------------------------------

function buildVideoSystemPrompt(targetModel: TargetModel): string {
  const profile = MODEL_PROFILES[targetModel]

  return `You are a video prompt writer working as a senior Director of Photography planning shots. You write prompts that describe MOTION, TEMPORAL CHANGES, and CAMERA MOVEMENT — not static images.

TARGET MODEL: ${profile.label}
${profile.promptRules}

VIDEO PROMPT PRINCIPLES:
- Focus on what MOVES and HOW — subject action, camera motion, scene evolution
- Do NOT re-describe visual content that a reference image already provides
- Specify camera movement explicitly: dolly, tracking, crane, pan, tilt, steadicam, handheld
- One dominant action per clip — don't overload
- Include temporal pacing: speed, rhythm, pauses, acceleration
- Sensory details for atmosphere: textures, temperatures, ambient sounds
- Length: ${profile.optimalLengthMin}-${profile.optimalLengthMax} words per prompt

MOTION VOCABULARY:
- Camera: dolly-in, tracking left, crane up, whip pan, slow push, pull-back reveal, orbit, dutch tilt
- Subject: turns slowly, glances over shoulder, hand rises to face, steps into light, exhales visibly
- Environment: wind shifts curtains, rain intensifies, light fades, shadows lengthen, dust motes drift
- Pacing: "beat of stillness", "sudden movement", "gradual reveal", "time-lapse compression"

${FORBIDDEN_LANGUAGE}

OUTPUT: Return ONLY valid JSON:
{
  "prompts": [
    { "label": "Shot 1", "prompt": "..." },
    { "label": "Shot 2", "prompt": "..." }
  ]
}`
}

// ---------------------------------------------------------------------------
// System prompt dispatcher
// ---------------------------------------------------------------------------

export function buildSystemPrompt(targetModel: TargetModel, mode: GenerationMode): string {
  switch (mode) {
    case 'generate': return buildGenerateSystemPrompt(targetModel)
    case 'edit': return buildEditSystemPrompt(targetModel)
    case 'video': return buildVideoSystemPrompt(targetModel)
  }
}

// ---------------------------------------------------------------------------
// User message builder — all modes
// ---------------------------------------------------------------------------

export function buildUserMessage(
  userInputs: UserInputs,
  promptCount: number,
  targetModel: TargetModel,
  mode: GenerationMode,
  visualStyleCues?: VisualStyleCues,
  imageLabels?: ImageLabel[]
): string {
  const profile = MODEL_PROFILES[targetModel]
  const hasDescription = userInputs.description.trim()
  const hasVisual = !!visualStyleCues

  const modeLabel = mode === 'generate' ? 'image generation'
    : mode === 'edit' ? 'image editing'
    : 'video generation'

  const lines: string[] = [
    `Generate exactly ${promptCount} ${profile.label} ${modeLabel} prompts.`,
    `Target: ${profile.optimalLengthMin}-${profile.optimalLengthMax} words per prompt.`,
  ]

  if (mode === 'generate') {
    lines.push(`All ${promptCount} prompts must look like frames pulled from the same film — same color grade, same lighting world, same emotional register.`)
    lines.push(`CRITICAL: Define a single color grade phrase and 2-3 anchor colors BEFORE writing. Then copy that exact color language into EVERY prompt. Do not vary the color description between prompts.`)
  } else if (mode === 'edit') {
    lines.push(`Each prompt is a different edit variant — same source image, different creative directions.`)
  } else {
    lines.push(`Each prompt is a separate shot in a sequence — maintain visual continuity across all shots.`)
  }

  // Visual reference
  if (hasVisual) {
    lines.push('\n=== VISUAL REFERENCE ===')
    lines.push(visualStyleCues.description)
    lines.push(`\nColor Palette: ${visualStyleCues.hexPalette.join(', ')}`)
    if (visualStyleCues.cinematicKeywords?.length > 0) {
      lines.push(`Cinematic Keywords: ${visualStyleCues.cinematicKeywords.join(' | ')}`)
    }
  }

  // Image labels
  if (imageLabels && imageLabels.length > 0) {
    lines.push('\n=== REFERENCE IMAGE LABELS ===')
    for (const il of imageLabels) {
      lines.push(`Image ${il.index + 1}: ${il.label}`)
    }
    if (mode === 'edit') {
      lines.push('(Use these labels to understand what each reference image contributes to the edit.)')
    }
  }

  // User description
  lines.push('\n=== CREATIVE DIRECTION ===')
  if (hasDescription) {
    lines.push(userInputs.description)
  } else if (hasVisual) {
    lines.push('(No text description — derive all from visual reference.)')
  } else {
    lines.push('(No inputs — generate a compelling cinematic sequence with clear visual identity.)')
  }

  // Mode-specific reminders
  if (mode === 'edit') {
    lines.push('\n=== EDIT REMINDER ===')
    lines.push('Each prompt must describe the DESIRED RESULT. Do not write "change X to Y" — write what the final image looks like.')
  } else if (mode === 'video') {
    lines.push('\n=== VIDEO REMINDER ===')
    lines.push('Focus on motion, camera movement, and temporal evolution. The reference image (if any) establishes the visual ground truth — your prompt adds the temporal dimension.')
  } else {
    lines.push('\n=== COHERENCE CHECK ===')
    lines.push('Before finalizing: Extract the color grade phrase from prompt 1. Is the EXACT same phrase in all other prompts? Are the same 2-3 hex anchor colors in every prompt? Same shadow direction? Same film stock? If any prompt drifts, rewrite it to match. The set must be intercuttable without a jarring color shift.')
  }

  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// Revision — fix-category-aware, history-preserving
// ---------------------------------------------------------------------------

export function buildRevisionSystemPrompt(targetModel: TargetModel, mode: GenerationMode): string {
  const profile = MODEL_PROFILES[targetModel]
  const modeLabel = mode === 'edit' ? 'editing' : mode === 'video' ? 'video' : 'image generation'

  return `You are correcting a specific issue in an existing ${profile.label} ${modeLabel} prompt. You are a senior Director of Photography making a surgical adjustment.

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

  if (fixCategory) {
    const cat = FIX_CATEGORIES.find(c => c.id === fixCategory)
    if (cat) {
      lines.push(`=== FIX CATEGORY: ${cat.label.toUpperCase()} ===`)
      lines.push(cat.instruction)
    }
  }

  if (revisionNote) {
    lines.push('')
    lines.push('=== REVISION INSTRUCTION ===')
    lines.push(revisionNote)
  }

  lines.push('')
  lines.push('=== SCENE CONTEXT ===')
  if (userInputs.description.trim()) {
    lines.push(userInputs.description)
  }

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
  return `You are reformatting a prompt from ${MODEL_PROFILES[fromModel].label} to ${to.label}. Preserve the exact same scene, subject, lighting, and mood — change ONLY the prompt format and length to match the target model's requirements.

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
