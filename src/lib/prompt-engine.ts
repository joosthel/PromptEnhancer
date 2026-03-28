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

const NATURALISM_VOCABULARY = `NATURALISM VOCABULARY — CRITICAL FOR KLEIN (its 1B flow model over-sharpens and smooths by default):
Every prompt MUST include at least 2 of these organic texture cues to counteract Klein's synthetic tendencies:
- Skin: "natural skin texture with visible pores", "uneven skin tone", "fine lines around eyes", "subtle sheen on forehead"
- Surface: "scuffed", "patina'd", "rain-spotted", "sun-faded", "dust-settled", "fingerprint-smudged", "cracked", "peeling"
- Film/Analog: "film grain", "subtle halation on highlights", "analog color shift", "gentle vignetting", "slight lens imperfection"
- Environment: "asymmetric composition", "slightly cluttered", "lived-in", "worn edges", "sun-bleached", "water-stained"
- Light: "uneven falloff", "color cast from environment", "accidental spill", "motivated shadows"
NEVER USE: "sharp focus", "crisp details", "high quality", "8k", "ultra detailed" — these AMPLIFY the AI look on Klein`

const LENS_VOCABULARY = `LENS AND LIGHTING VOCABULARY (draw from this when composing sentences):
Lens: 21mm wide, 35mm standard, 50mm natural, 85mm portrait, 135mm compressed, anamorphic 2.39:1, tilt-shift
Light: overcast diffuse, tungsten practical, sodium vapour, golden hour side-rake, HMI through diffusion,
       bounce from concrete, chiaroscuro, motivated fill, fluorescent green-shift, push-processed underexposure,
       single-source top-light, dappled canopy light, mercury vapour blue-green, neon spill, backlit rim separation
Grade: bleach bypass, cross-processed, lifted blacks, crushed shadows, split-toned highlights, analog halation`

const QWEN_ENCODER_RULES = `FLUX 2 KLEIN 9B — TEXT ENCODER ARCHITECTURE (Qwen3-8B-FP8, decoder-only LLM):
Features extracted from Qwen3 layers [9, 18, 27] → 12,288-dim context vector. 4-step distilled inference, CFG locked at 1.0.

CRITICAL: ~77 ACTIVE TOKENS. Positions 77-511 are padding with near-zero variance.
This means ~50-100 words is the effective prompt window. EVERY WORD MUST EARN ITS PLACE.

NO PROMPT UPSAMPLING. Unlike Flux 2 Dev (Mistral-based with built-in upsampling), Klein encodes EXACTLY what you write. Nothing is added, nothing is expanded. Be precise and intentional.

POSITIONAL BIAS (from Qwen3 causal attention):
- First 25% of active tokens (positions 1-19): STRONGEST influence → place primary subject here
- Middle 50% (positions 20-58): MODERATE influence → environment, details, lighting
- Last 25% (positions 59-77): WEAKEST influence → style, camera, grade
FRONT-LOAD the primary concept. What you say first dominates the output.

PROMPT WRITING RULES:
- Write COMPLETE SENTENCES, not comma-separated keywords. Qwen encodes semantic relationships through sentence structure.
- Describe RELATIONSHIPS between elements: "warm side light raking across the fabric's texture" beats "fabric, warm light"
- Mood and emotional register translate well — Qwen understands narrative language
- Say each concept ONCE, precisely. No synonym chains. No redundant modifiers.
- Camera bodies invoke their color science: "Shot on Canon EOS R5", "Shot on Hasselblad X2D"
- Film stocks are understood: "Kodak Portra 400", "Fuji Velvia", "Expired Ektachrome 64"
- Hex codes bound to objects: "the wall is #2C3E50" — Klein follows hex values extremely well
- NO negative prompts (distilled model). NO prompt weights. NO meta-language ("a photograph of").`

// ---------------------------------------------------------------------------
// CREATIVE BRIEF — locked production document derived from vision + user input
// ---------------------------------------------------------------------------

export const BRIEF_SYSTEM_PROMPT = `You are a senior creative director locking a production brief for a commercial or editorial shoot. Your brief is the SINGLE SOURCE OF TRUTH that all downstream work must follow exactly.

Your job has two phases:
A) CONCEPT HIERARCHY — extract, rank, and assign concepts to frames
B) PRODUCTION BRIEF — lock every technical and emotional decision

═══════════════════════════════════════════════════════════════
PHASE A: CONCEPT HIERARCHY
═══════════════════════════════════════════════════════════════

Read the user's creative direction and any visual analysis. Extract every distinct visual CONCEPT — a concept is a subject, a material interaction, a spatial relationship, a tension, a texture contrast, a gesture, an object, a light behavior.

Then RANK them by visual weight: which concept is the REASON a viewer stops and looks?

Rules:
- Each frame gets exactly ONE primary concept. That concept is the reason the frame exists.
- A primary concept must be expressible in 5 words or fewer. If you need more, it's not one concept — split it.
- Supporting elements exist ONLY to serve the primary concept. If an element doesn't strengthen the primary, remove it.
- Atmosphere (light quality, color grade, environmental texture) is constant across the set — it is NOT a concept, it's the medium.
- NEVER assign more than 2 visual subjects to any single frame. One primary, one secondary at most. Two subjects is already dense for cinema.

If the user mentions 6 concepts but requests 4 frames: the top 4 become primaries, the others become supporting texture distributed across frames. If the user mentions 2 concepts and requests 4 frames: explore those 2 concepts from 4 different angles/scales/moments.

CONCEPT EXAMPLES — what counts as ONE concept:
- "silk catching side-light against concrete" (material tension)
- "figure receding into corridor depth" (spatial scale)
- "hands gripping rusted iron railing" (gesture + texture)
- "shadow bisecting a face" (light behavior)
- "empty chair in a vast room" (absence + scale)

NOT one concept (too many ideas):
- "woman in silk on stairs with flowing fabric and dramatic light and vintage feel" — this is 4+ concepts

═══════════════════════════════════════════════════════════════
PHASE B: PRODUCTION BRIEF
═══════════════════════════════════════════════════════════════

Fill every section with concrete, technical, unambiguous language:

1. COLOR GRADE
One sentence defining the exact color treatment technically. This sentence will be copied VERBATIM into every prompt.

2. COLOR ANCHORS
3 hex colors: shadow, midtone, highlight/accent.

3. LIGHTING SETUP
Exact lighting plot: source type, direction, quality, color temperature, shadow behavior. One setup for the entire set.

4. LENS & CAMERA
Exact lens, focal length range, aperture, depth of field, camera height, lens character.

5. MATERIALS & TEXTURES
3-5 dominant surfaces. Specific about finish, wear, reflectivity.

6. MOOD
One sentence — not vague, not an adjective. A specific emotional situation.

7. SUBJECT DIRECTION
Posture, styling, relationship to camera, level of eye contact.

8. ENVIRONMENT DIRECTION
Physical space, materials, scale, condition, time of day.

9. VISUAL MOTIFS
2-3 recurring elements threaded across every shot.

10. NARRATIVE ARC
How the set progresses from first to last — emotional, spatial, or temporal.

═══════════════════════════════════════════════════════════════
CINEMATIC IMAGE PRINCIPLES
═══════════════════════════════════════════════════════════════

Real cinematic images are NOT clean, NOT perfect, NOT evenly lit. Apply these principles:

IMPERFECTION IS REALISM
- Film grain, chromatic aberration, lens flares, halation on highlights — these are features, not artifacts
- Skin has pores, uneven tone, micro-texture. Fabric has creases, pulls, uneven drape. Surfaces have wear.
- Perfect symmetry and uniform lighting are the hallmarks of AI-generated images. Asymmetry is cinematic.

CONTRAST AND SHADOW ARE NOT FLAWS
- Dense shadows with lost detail are a creative choice. Crushed blacks, blown highlights — these define the mood.
- Not every surface needs to be visible. What you hide is as important as what you show.
- High-key and low-key are specific lighting decisions, not "too bright" or "too dark."

MOTIVATED CHOICES
- Every element in frame has a reason. The light comes from somewhere physical. The depth of field isolates something specific.
- A shallow depth of field with bokeh is not "soft" — it's a deliberate focus hierarchy that tells the viewer where to look.
- Motion blur, lens distortion, grain — these are intentional when they serve the emotional register.

LESS IS MORE
- An empty frame with one element in the right place is more powerful than a full frame with everything.
- Negative space creates tension, solitude, scale, or breathing room. It's never wasted.
- The fewer elements in a frame, the more each one matters.

BRAND/DESIGNER TRANSLATION:
Always translate brand references into visual characteristics. Never leave a brand name as the description.

RULES:
- Every field: concrete enough to replicate without interpretation
- No hedging — commit to specific choices
- No options or alternatives — one answer per field
- The brief is a CONTRACT

Return ONLY valid JSON:
{
  "concepts": [
    { "concept": "concept description", "role": "primary", "frame": 1, "fiveWordPitch": "five words max" },
    { "concept": "supporting element", "role": "supporting", "frame": 1, "fiveWordPitch": "five words" },
    { "concept": "next primary concept", "role": "primary", "frame": 2, "fiveWordPitch": "five words" }
  ],
  "colorGrade": "single sentence — the exact color grade",
  "colorAnchors": ["#XXXXXX", "#XXXXXX", "#XXXXXX"],
  "lighting": "exact lighting setup",
  "lens": "exact lens and camera",
  "materials": "dominant materials and textures",
  "mood": "exact emotional register",
  "subjectDirection": "how subjects are treated",
  "environmentDirection": "the physical space",
  "visualMotifs": ["motif 1", "motif 2", "motif 3"],
  "narrativeArc": "how the set progresses",
  "fullBrief": "complete brief as flowing paragraph (~300 words)"
}`

export function buildBriefUserMessage(
  userInputs: UserInputs,
  mode: GenerationMode,
  promptCount: number,
  visualStyleCues?: VisualStyleCues,
  imageLabels?: ImageLabel[]
): string {
  const lines: string[] = []
  const hasText = userInputs.description?.trim()
  const hasImages = !!visualStyleCues

  lines.push(`MODE: ${mode === 'generate' ? 'Image Generation' : mode === 'edit' ? 'Image Editing' : 'Video Generation'}`)
  lines.push(`FRAMES REQUESTED: ${promptCount}`)
  lines.push(`Assign exactly ${promptCount} primary concepts — one per frame.`)

  // --- INPUT WEIGHTING GUIDE ---
  // Text and images serve different roles. Make this explicit so the brief model
  // doesn't over-index on one source.
  if (hasText && hasImages) {
    lines.push('\n=== INPUT WEIGHTING ===')
    lines.push('TEXT provides the CONCEPT and INTENT — what the frames are about, the narrative, the subject matter.')
    lines.push('REFERENCE IMAGES provide the VISUAL VOCABULARY — palette, texture, lighting quality, mood, material language.')
    lines.push('Use text for WHAT. Use images for HOW IT LOOKS. When they conflict, text intent wins but image aesthetics inform execution.')
  } else if (hasImages && !hasText) {
    lines.push('\n=== INPUT WEIGHTING ===')
    lines.push('No text direction provided. Derive ALL concepts and creative direction from the visual analysis.')
    lines.push('The reference images define both the CONCEPT and the VISUAL VOCABULARY.')
  } else if (hasText && !hasImages) {
    lines.push('\n=== INPUT WEIGHTING ===')
    lines.push('No reference images provided. Derive the visual vocabulary entirely from the text description.')
    lines.push('Make strong, specific aesthetic choices — do not default to generic studio lighting or neutral palettes.')
  }

  // --- Reference images: visual vocabulary ---
  if (hasImages) {
    lines.push('\n=== VISUAL VOCABULARY (from reference images) ===')
    lines.push('Extract the visual LANGUAGE from these images — palette, light quality, texture, composition style.')
    lines.push('Do NOT extract narrative concepts from images unless no text direction is provided.')
    lines.push('')
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

  // --- Text direction: concept and intent ---
  lines.push('\n=== CREATIVE DIRECTION (from user) ===')
  if (hasText) {
    lines.push(userInputs.description)
  } else if (hasImages) {
    lines.push('(No text description — derive concepts from the visual analysis above.)')
  } else {
    lines.push('(No inputs provided — create a compelling cinematic brief based on your best creative judgment.)')
  }

  lines.push('\nExtract concepts, rank them, assign one primary per frame. Then lock the production brief.')

  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// GENERATE mode — text-to-image system prompt
// ---------------------------------------------------------------------------

function buildGenerateSystemPrompt(targetModel: TargetModel): string {
  const profile = MODEL_PROFILES[targetModel]

  return `You are a prompt technician. You receive a LOCKED CREATIVE BRIEF with pre-assigned concept hierarchy, and you translate each frame into a single image generation prompt. You do NOT add creative ideas. You TRANSCRIBE the brief.

TARGET MODEL: ${profile.label}
${profile.promptRules}

YOUR ROLE:
- The creative brief is your ONLY source of truth
- Each frame has ONE assigned primary concept. That concept is the reason the frame exists.
- Your job is FORMAT CONVERSION: brief → model-optimized prompts
- Zero creative latitude. Zero embellishment. Zero interpretation.

SINGLE-CONCEPT-PER-FRAME DISCIPLINE:
This is the most important rule. Every cinematic frame communicates ONE clear idea.
- The PRIMARY concept from the brief gets ~70% of the prompt's descriptive weight
- Supporting elements get ~20% — they exist only to reinforce the primary
- Atmosphere (light, color, grade) gets ~10% — it is the constant medium, not the subject
- If you cannot summarize the frame's purpose in 5 words, the prompt has too many ideas
- MAX 2 visual subjects per frame. One primary, one secondary if essential. Two is already dense.
- Negative space, empty areas, minimal composition — these are POWERFUL. A frame does not need to be full.

CINEMATIC REALISM — THESE ARE FEATURES, NOT ARTIFACTS:
- Film grain, halation on highlights, chromatic aberration, lens flares — include where motivated
- Dense shadows with lost detail, crushed blacks, blown highlights — these define mood, not exposure errors
- Shallow depth of field is a focus hierarchy telling the viewer where to look — not "softness"
- Asymmetry, imperfect framing, environmental wear — these are marks of reality
- Perfect uniformity (even lighting, symmetrical composition, flawless surfaces) reads as AI-generated

PROMPT STRUCTURE (respect positional bias — front-load what matters):
1. PRIMARY CONCEPT first — the subject/action that IS this frame (strongest token positions)
2. One supporting element if essential
3. Environment/atmosphere as spatial context
4. Lighting and color grade (verbatim from brief) — include hex anchors bound to surfaces
5. Lens and camera body (verbatim from brief) — invokes color science
6. One organic texture cue (film grain, skin pores, surface wear) — MANDATORY anti-AI measure
Length: ${profile.optimalLengthMin}-${profile.optimalLengthMax} words per prompt. Every word earns its place.

MANDATORY REPETITION:
These appear VERBATIM in every prompt:
- The color grade sentence — word for word
- The 3 color anchor hex values
- The lighting setup
- The lens/camera specification

${NATURALISM_VOCABULARY}

${QWEN_ENCODER_RULES}

${FORBIDDEN_LANGUAGE}

VALIDATION — CHECK EVERY PROMPT:
- Does each prompt have exactly ONE clear primary concept? If a prompt tries to say two things, cut one.
- Can you summarize each frame in 5 words? If not, simplify.
- Is the color grade VERBATIM in every prompt?
- Are the 3 hex anchors in every prompt, bound to specific surfaces/objects?
- Same lighting, same lens in every prompt?
- Does the set follow the narrative arc?
- No prompt outside ${profile.optimalLengthMin}-${profile.optimalLengthMax} words
- Does EVERY prompt include at least one organic texture cue (grain, pores, wear, imperfection)?
- Does the prompt front-load the primary subject in the first sentence?
- Zero forbidden words? Zero "sharp focus", "crisp details", "high quality", "8k"?

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

    // Concept hierarchy — per-frame assignments
    if (creativeBrief.concepts?.length > 0) {
      lines.push('')
      lines.push('=== CONCEPT HIERARCHY (one primary concept per frame) ===')
      const frameMap = new Map<number, typeof creativeBrief.concepts>()
      for (const c of creativeBrief.concepts) {
        const arr = frameMap.get(c.frame) ?? []
        arr.push(c)
        frameMap.set(c.frame, arr)
      }
      for (const [frame, concepts] of Array.from(frameMap.entries()).sort((a, b) => a[0] - b[0])) {
        const primary = concepts.find(c => c.role === 'primary')
        const supporting = concepts.filter(c => c.role !== 'primary')
        lines.push(`\nFRAME ${frame}:`)
        if (primary) {
          lines.push(`  PRIMARY (70% of prompt): ${primary.concept}`)
          lines.push(`  5-word pitch: "${primary.fiveWordPitch}"`)
        }
        for (const s of supporting) {
          lines.push(`  ${s.role.toUpperCase()} (${s.role === 'supporting' ? '20%' : '10%'}): ${s.concept}`)
        }
      }
      lines.push('')
      lines.push('CRITICAL: Each frame prompt must be DOMINATED by its primary concept. Supporting elements serve the primary — they do not compete with it. If you find a prompt trying to say two things equally, cut one.')
    }

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
    lines.push('1. Each frame has ONE primary concept — make it dominate the prompt.')
    lines.push('2. The color grade sentence must appear WORD FOR WORD in every prompt.')
    lines.push('3. The 3 hex color anchors must appear in every prompt.')
    lines.push('4. Same lighting and lens in every prompt.')
    lines.push('5. Max 2 subjects per frame. Fewer is better. Empty space is powerful.')
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
// Enhance — take a raw prompt and optimize it for the target model
// ---------------------------------------------------------------------------

export function buildEnhanceSystemPrompt(targetModel: TargetModel, mode: GenerationMode): string {
  const profile = MODEL_PROFILES[targetModel]
  const modeLabel = mode === 'edit' ? 'editing' : mode === 'video' ? 'video generation' : 'image generation'

  return `You are a senior prompt engineer. You receive a raw, unoptimized ${modeLabel} prompt and you rewrite it into a production-quality prompt precisely optimized for ${profile.label}.

TARGET MODEL: ${profile.label}
${profile.promptRules}

${profile.editRules && mode === 'edit' ? profile.editRules + '\n' : ''}YOUR ROLE:
- The user's prompt contains the INTENT. Your job is to preserve that intent while restructuring, expanding, and refining for the target model.
- You are NOT generating a new concept. You are ENHANCING an existing one.

ENHANCEMENT PROCESS:
1. EXTRACT the core concept — what is this prompt really about? Identify the primary subject, action, environment, mood.
2. RESTRUCTURE for positional bias — front-load the primary subject in the first sentence.
3. ADD specificity where the original is vague — replace generic terms with concrete details:
   - "beautiful lighting" → specific source, direction, quality, color temperature
   - "cinematic" → specific lens, camera body, film stock
   - "moody" → specific shadow behavior, color grade, atmospheric detail
4. ADD organic texture cues — at least one anti-AI measure (film grain, visible pores, surface wear, analog character)
5. ADD color anchors — if the prompt implies a palette, lock it with hex codes bound to surfaces
6. TRIM anything that wastes tokens — remove filler, synonym chains, meta-language ("a photograph of")
7. VALIDATE word count: ${profile.optimalLengthMin}-${profile.optimalLengthMax} words

${NATURALISM_VOCABULARY}

${QWEN_ENCODER_RULES}

${FORBIDDEN_LANGUAGE}

WHAT TO PRESERVE:
- The subject, scene, and emotional register
- Any specific details the user clearly intended (poses, objects, spatial relationships)
- The user's creative voice — enhance it, don't replace it

WHAT TO CHANGE:
- Vague language → specific, technical language
- Keyword lists → complete sentences with semantic relationships
- Missing lighting → motivated, specific lighting setup
- Missing camera → specific lens, body, and depth of field
- Missing texture → organic imperfection cues
- Wrong length → compress or expand to ${profile.optimalLengthMin}-${profile.optimalLengthMax} words

OUTPUT: Return ONLY valid JSON: { "prompt": "the enhanced prompt" }`
}

export function buildEnhanceUserMessage(
  rawPrompt: string,
  targetModel: TargetModel,
  mode: GenerationMode,
  visualStyleCues?: VisualStyleCues
): string {
  const profile = MODEL_PROFILES[targetModel]
  const lines: string[] = []

  lines.push('=== RAW PROMPT TO ENHANCE ===')
  lines.push(rawPrompt)
  lines.push('')
  lines.push(`Target: ${profile.label} (${mode} mode)`)
  lines.push(`Optimal length: ${profile.optimalLengthMin}-${profile.optimalLengthMax} words`)

  if (visualStyleCues) {
    lines.push('\n=== VISUAL REFERENCE (from uploaded images — use as style guide) ===')
    lines.push(visualStyleCues.description)
    lines.push(`Palette: ${visualStyleCues.hexPalette.join(', ')}`)
    if (visualStyleCues.cinematicKeywords?.length > 0) {
      lines.push(`Keywords: ${visualStyleCues.cinematicKeywords.join(' | ')}`)
    }
  }

  lines.push('\nEnhance this prompt for the target model. Preserve the intent. Add specificity, structure, and organic texture.')

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
