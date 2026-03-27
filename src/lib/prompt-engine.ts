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
import type { UserInputs, VisualStyleCues, ImageLabel, CreativeBrief } from './system-prompt'
import { GEMINI_VISION_PROMPT } from './system-prompt'

export { GEMINI_VISION_PROMPT }
export type { CreativeBrief }

// ---------------------------------------------------------------------------
// Shared vocabulary blocks
// ---------------------------------------------------------------------------

const FORBIDDEN_LANGUAGE = `FORBIDDEN WORDS (these add noise with zero directional value — never use):
"ethereal", "dreamlike", "magical", "otherworldly", "surreal", "breathtaking",
"whimsical", "fantastical", "enchanted", "mystical", "stunning", "captivating",
"mesmerizing", "awe-inspiring", "hauntingly beautiful", "masterpiece", "best quality",
"8k", "ultra HD", "hyperrealistic" — instead describe specifically what makes the image precise`

const NATURALISM_VOCABULARY = `NATURALISM VOCABULARY (weave into sentences to counter synthetic AI look):
- Surface: scuffed, patina'd, rain-spotted, sun-faded, dust-settled, fingerprint-smudged
- Skin: pores visible, uneven tone, slight sheen, natural blemishes, fine lines
- Environment: asymmetric, slightly cluttered, lived-in, imperfect, worn edges
- Light: uneven falloff, color cast from environment, accidental spill, motivated shadows`

const LENS_VOCABULARY = `LENS AND LIGHTING VOCABULARY (draw from this when composing sentences):
Lens: 21mm wide, 35mm standard, 50mm natural, 85mm portrait, 135mm compressed, anamorphic 2.39:1, tilt-shift
Light: overcast diffuse, tungsten practical, sodium vapour, golden hour side-rake, HMI through diffusion,
       bounce from concrete, chiaroscuro, motivated fill, fluorescent green-shift, push-processed underexposure,
       single-source top-light, dappled canopy light, mercury vapour blue-green, neon spill, backlit rim separation
Grade: bleach bypass, cross-processed, lifted blacks, crushed shadows, split-toned highlights, analog halation`

const QWEN_ENCODER_RULES = `TEXT ENCODER NOTES (Flux 2 Klein and Z-Image both use Qwen — an LLM-based text encoder):
- Write in COMPLETE SENTENCES, not comma-separated keyword tags. Qwen processes natural language; sentence structure encodes semantic relationships that keyword lists cannot.
- ORDER: subject → environment → lighting → mood → camera. Qwen is autoregressive — details mentioned later are deprioritized, so lead with what matters most.
- Describe RELATIONSHIPS between elements, not just elements ("warm side light raking across the fabric's texture" beats "fabric, warm light").
- Mood and emotional register translate well — Qwen understands contextual and narrative language ("quiet tension of a conversation just ended" implies a lighting and spatial arrangement).
- Avoid repeating the same concept in multiple ways in one prompt — say it once, precisely.`

// ---------------------------------------------------------------------------
// CREATIVE BRIEF — locked production document derived from vision + user input
// ---------------------------------------------------------------------------

export const BRIEF_SYSTEM_PROMPT = `You are a senior creative director locking a production brief for a commercial or editorial shoot. Your brief is the SINGLE SOURCE OF TRUTH that all downstream work must follow exactly. Nothing outside this brief exists.

Your job: take the visual analysis and the user's creative direction and produce a LOCKED PRODUCTION BRIEF. This brief must be so specific and concrete that any competent cinematographer could reproduce the exact look without asking a single question.

BRIEF STRUCTURE — fill every section with concrete, technical, unambiguous language:

1. COLOR GRADE
One sentence defining the exact color treatment. Name the grade technically (e.g., "desaturated cool palette with lifted blacks, blue-grey shadows at #4A5568, muted warm skin tones shifted toward peach #E8C4A0"). This sentence will be copied VERBATIM into every prompt.

2. COLOR ANCHORS
Exactly 3 hex colors that anchor every image: shadow tone, midtone, highlight/accent. These appear in every prompt.

3. LIGHTING SETUP
Exact light setup as if writing a lighting plot. Name source type, direction, quality, color temperature, shadow behavior. One setup that applies to the entire set. (e.g., "Single overhead HMI through 4x4 light grid cloth, 5600K, creating soft even top-light with minimal shadows. Fill from white bounce below camera. Practicals in frame: warm tungsten 2700K desk lamp providing accent on subject's face.")

4. LENS & CAMERA
Exact lens family, focal length range, aperture, depth of field, camera height, any specific lens character (anamorphic, vintage, clinical). One camera setup for the set.

5. MATERIALS & TEXTURES
The 3-5 dominant material/texture qualities that must appear across the set. Be specific about surface finish, wear, and reflectivity.

6. MOOD & EMOTIONAL REGISTER
One sentence defining the exact emotional tone. Not vague ("moody") — specific ("quiet tension of an unresolved conversation, intimacy held at arm's length").

7. SUBJECT DIRECTION
How subjects are posed, styled, and related to camera. Specific enough to direct a model on set.

8. ENVIRONMENT DIRECTION
The physical space. Materials, scale, condition, time of day, weather if exterior.

9. VISUAL MOTIFS
2-3 specific recurring visual elements that thread through every shot (a material, a shape, a light behavior, an object).

10. NARRATIVE ARC
How the set of images progresses from first to last shot — emotional escalation, spatial progression, or temporal shift.

BRAND/DESIGNER TRANSLATION:
If the user mentions brands or designers, translate them into their VISUAL CHARACTERISTICS:
- "Jil Sander" → "minimalist tailoring, architectural lines, dove grey and ivory palette, structured wool, absence of ornament"
- "Helmut Newton" → "high-contrast black and white, hard directional light, angular posed confidence, polished surfaces"
- Always translate — never leave a brand name as the description.

RULES:
- Every field must be concrete enough to replicate without interpretation
- No hedging ("perhaps", "could be", "maybe") — commit to specific choices
- No options or alternatives — one answer per field
- If the user's description is vague, make the best specific choice and commit to it
- The brief is a CONTRACT — downstream prompts must follow it exactly

Return ONLY valid JSON matching this structure:
{
  "colorGrade": "single sentence — the exact color grade",
  "colorAnchors": ["#XXXXXX", "#XXXXXX", "#XXXXXX"],
  "lighting": "exact lighting setup description",
  "lens": "exact lens and camera description",
  "materials": "dominant materials and textures",
  "mood": "exact emotional register",
  "subjectDirection": "how subjects are treated",
  "environmentDirection": "the physical space",
  "visualMotifs": ["motif 1", "motif 2", "motif 3"],
  "narrativeArc": "how the set progresses",
  "fullBrief": "the complete brief as a single flowing paragraph (~300 words) combining all of the above into a unified production document"
}`

export function buildBriefUserMessage(
  userInputs: UserInputs,
  mode: GenerationMode,
  visualStyleCues?: VisualStyleCues,
  imageLabels?: ImageLabel[]
): string {
  const lines: string[] = []

  lines.push(`MODE: ${mode === 'generate' ? 'Image Generation' : mode === 'edit' ? 'Image Editing' : 'Video Generation'}`)

  if (visualStyleCues) {
    lines.push('\n=== VISUAL ANALYSIS (from reference images) ===')
    lines.push(visualStyleCues.description)
    lines.push(`\nExtracted Palette: ${visualStyleCues.hexPalette.join(', ')}`)
    if (visualStyleCues.cinematicKeywords?.length > 0) {
      lines.push(`Cinematic Keywords: ${visualStyleCues.cinematicKeywords.join(' | ')}`)
    }
  }

  if (imageLabels && imageLabels.length > 0) {
    lines.push('\n=== REFERENCE IMAGE LABELS ===')
    for (const il of imageLabels) {
      lines.push(`Image ${il.index + 1}: ${il.label}`)
    }
  }

  lines.push('\n=== CREATIVE DIRECTION (from user) ===')
  if (userInputs.description.trim()) {
    lines.push(userInputs.description)
  } else if (visualStyleCues) {
    lines.push('(No text description — derive all creative direction from the visual analysis above.)')
  } else {
    lines.push('(No inputs provided — create a compelling cinematic brief based on your best creative judgment.)')
  }

  lines.push('\nLock the brief. Be specific. Commit to every choice.')

  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// GENERATE mode — text-to-image system prompt
// ---------------------------------------------------------------------------

function buildGenerateSystemPrompt(targetModel: TargetModel): string {
  const profile = MODEL_PROFILES[targetModel]

  return `You are a prompt technician. You receive a LOCKED CREATIVE BRIEF and you translate it into image generation prompts. You do NOT add creative ideas. You do NOT interpret. You TRANSCRIBE the brief into prompt format.

TARGET MODEL: ${profile.label}
${profile.promptRules}

YOUR ROLE:
- The creative brief is your ONLY source of truth
- Every visual decision has already been made in the brief
- Your job is FORMAT CONVERSION: brief → model-optimized prompts
- If the brief says "desaturated cool tones with lifted blacks" then EVERY prompt contains those exact words
- Zero creative latitude. Zero embellishment. Zero interpretation.

PROMPT STRUCTURE:
1. Each prompt: [color_grade_from_brief] [subject+action_from_brief] [environment_from_brief] [lighting_from_brief] [lens_from_brief]
2. Length: ${profile.optimalLengthMin}-${profile.optimalLengthMax} words per prompt
3. Each prompt uses a different camera angle: Wide Establishing / Medium / Close-Up / Low-Angle / High-Angle / Dutch Angle

MANDATORY REPETITION ACROSS ALL PROMPTS:
These elements from the brief must appear VERBATIM in every single prompt:
- The color grade sentence — copy it word for word
- The 3 color anchor hex values
- The lighting setup description
- The lens/camera specification
The ONLY things that change between prompts are: camera angle, subject action/pose, and framing.

PROMPT WRITING RULES:
- Write in complete natural language sentences — not comma lists or keyword tags
- Each prompt is ~2-4 sentences following this order: subject+action → environment → lighting → camera
- Never combine contradictory modifiers (e.g., "close-up wide-angle")
- Avoid text/typography in the image unless specifically requested
- Ground every element in physical reality — specify materials, weathering, surface finish
- 3-5 primary visual concepts per prompt maximum; more creates noise

${NATURALISM_VOCABULARY}

${QWEN_ENCODER_RULES}

${FORBIDDEN_LANGUAGE}

COHERENCE VALIDATION (verify before returning):
- Extract the color grade from the brief. Is it VERBATIM in every prompt? If not, fix.
- Are the 3 hex color anchors in every prompt? If not, fix.
- Is the same lighting setup in every prompt? If not, fix.
- Is the same lens in every prompt? If not, fix.
- Do the visual motifs from the brief appear across prompts? If not, fix.
- Does the narrative arc from the brief progress across the set? If not, fix.
- No prompt falls outside ${profile.optimalLengthMin}-${profile.optimalLengthMax} words

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
- Write in complete sentences describing the DESIRED RESULT — not "change X to Y"
- Be specific about what should change and what should be preserved
- One major change per prompt yields best quality
- Length: ${profile.optimalLengthMin}-${profile.optimalLengthMax} words per prompt
- Max reference images: ${profile.maxReferenceImages}

REFERENCE IMAGE AWARENESS:
- "style reference" → apply that image's visual style to the output
- "subject" / "face" → preserve that person/object in the new scene
- "background" → use as the environment, replace or modify the foreground
- Unlabeled references → infer purpose from the user's description

${QWEN_ENCODER_RULES}

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
- Write in complete sentences describing MOTION and TEMPORAL CHANGES — not static image attributes
- Do NOT re-describe visual content that a reference image already provides
- Specify camera movement explicitly within the sentence (e.g., "a slow dolly pushes into the subject's face as...")
- One dominant action per clip — don't overload
- Include temporal pacing: speed, rhythm, pauses, acceleration
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
  imageLabels?: ImageLabel[],
  creativeBrief?: CreativeBrief
): string {
  const profile = MODEL_PROFILES[targetModel]

  const modeLabel = mode === 'generate' ? 'image generation'
    : mode === 'edit' ? 'image editing'
    : 'video generation'

  const lines: string[] = [
    `Generate exactly ${promptCount} ${profile.label} ${modeLabel} prompts.`,
    `Target: ${profile.optimalLengthMin}-${profile.optimalLengthMax} words per prompt.`,
  ]

  // Brief-driven generation (primary path for generate mode)
  if (creativeBrief && mode === 'generate') {
    lines.push('\n=== LOCKED CREATIVE BRIEF — YOUR ONLY SOURCE OF TRUTH ===')
    lines.push('Every visual decision is made. You are a transcriber, not a creative.')
    lines.push('')
    lines.push(`COLOR GRADE (copy VERBATIM into every prompt): ${creativeBrief.colorGrade}`)
    lines.push(`COLOR ANCHORS (include in every prompt): ${creativeBrief.colorAnchors.join(', ')}`)
    lines.push(`LIGHTING: ${creativeBrief.lighting}`)
    lines.push(`LENS & CAMERA: ${creativeBrief.lens}`)
    lines.push(`MATERIALS: ${creativeBrief.materials}`)
    lines.push(`MOOD: ${creativeBrief.mood}`)
    lines.push(`SUBJECT: ${creativeBrief.subjectDirection}`)
    lines.push(`ENVIRONMENT: ${creativeBrief.environmentDirection}`)
    lines.push(`VISUAL MOTIFS (thread across prompts): ${creativeBrief.visualMotifs.join(' | ')}`)
    lines.push(`NARRATIVE ARC: ${creativeBrief.narrativeArc}`)
    lines.push('')
    lines.push('=== RULES ===')
    lines.push('1. The color grade sentence above must appear WORD FOR WORD in every prompt.')
    lines.push('2. The 3 hex color anchors must appear in every prompt.')
    lines.push('3. The lighting description must appear in every prompt.')
    lines.push('4. The lens specification must appear in every prompt.')
    lines.push('5. The ONLY variation between prompts: camera angle, subject pose/action, and framing.')
    lines.push('6. Follow the narrative arc from first to last shot.')

    return lines.join('\n')
  }

  // Edit mode — brief-aware but not brief-locked
  if (mode === 'edit') {
    lines.push(`Each prompt is a different edit variant — same source image, different creative directions.`)

    if (creativeBrief) {
      lines.push('\n=== CREATIVE BRIEF (guide, not verbatim) ===')
      lines.push(creativeBrief.fullBrief)
    }

    if (imageLabels && imageLabels.length > 0) {
      lines.push('\n=== REFERENCE IMAGE LABELS ===')
      for (const il of imageLabels) {
        lines.push(`Image ${il.index + 1}: ${il.label}`)
      }
      lines.push('(Use these labels to understand what each reference image contributes to the edit.)')
    }

    if (userInputs.description.trim()) {
      lines.push('\n=== CREATIVE DIRECTION ===')
      lines.push(userInputs.description)
    }

    lines.push('\n=== EDIT REMINDER ===')
    lines.push('Each prompt must describe the DESIRED RESULT. Do not write "change X to Y" — write what the final image looks like.')

    return lines.join('\n')
  }

  // Video mode — brief-aware
  if (mode === 'video') {
    lines.push(`Each prompt is a separate shot in a sequence — maintain visual continuity across all shots.`)

    if (creativeBrief) {
      lines.push('\n=== CREATIVE BRIEF (maintain visual continuity from this) ===')
      lines.push(creativeBrief.fullBrief)
    }

    if (visualStyleCues) {
      lines.push('\n=== VISUAL REFERENCE ===')
      lines.push(visualStyleCues.description)
      lines.push(`Color Palette: ${visualStyleCues.hexPalette.join(', ')}`)
    }

    if (userInputs.description.trim()) {
      lines.push('\n=== CREATIVE DIRECTION ===')
      lines.push(userInputs.description)
    }

    lines.push('\n=== VIDEO REMINDER ===')
    lines.push('Focus on motion, camera movement, and temporal evolution. The reference image (if any) establishes the visual ground truth — your prompt adds the temporal dimension.')

    return lines.join('\n')
  }

  // Fallback: generate without brief (no reference images)
  if (visualStyleCues) {
    lines.push('\n=== VISUAL REFERENCE ===')
    lines.push(visualStyleCues.description)
    lines.push(`\nColor Palette: ${visualStyleCues.hexPalette.join(', ')}`)
    if (visualStyleCues.cinematicKeywords?.length > 0) {
      lines.push(`Cinematic Keywords: ${visualStyleCues.cinematicKeywords.join(' | ')}`)
    }
  }

  if (userInputs.description.trim()) {
    lines.push('\n=== CREATIVE DIRECTION ===')
    lines.push(userInputs.description)
  } else {
    lines.push('\n=== CREATIVE DIRECTION ===')
    lines.push('(No inputs — generate a compelling cinematic sequence with clear visual identity.)')
  }

  lines.push('\n=== COHERENCE CHECK ===')
  lines.push('Before finalizing: define ONE color grade phrase and copy it VERBATIM into every prompt. Same lighting, same lens, same anchors. The set must be intercuttable.')

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
