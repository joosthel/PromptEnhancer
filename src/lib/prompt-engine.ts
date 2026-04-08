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

const FORBIDDEN_LANGUAGE = `FORBIDDEN (these cause bad results):
VAGUE ADJECTIVES: "ethereal", "dreamlike", "magical", "breathtaking", "masterpiece", "best quality", "8k", "ultra HD", "hyperrealistic"
(EXCEPTION: illustration medium allows "ethereal", "dreamlike", "whimsical")
LIGHTING EQUIPMENT (Klein renders as objects): "softbox", "HMI", "key light", "fill light", "bounce light", "reflector", "beauty dish", "ring light" — name the PHYSICAL SOURCE instead ("window light from left", "overhead fluorescent")
SHARPNESS AMPLIFIERS: "sharp focus", "crisp details", "high quality", "ultra detailed" — amplify AI look`

const NATURALISM_VOCABULARY = `NATURALISM — counteract Klein's synthetic smoothness. Include 1-2 texture cues per prompt:
- Worn scenes: "scuffed", "rain-spotted", "dust-settled", "sun-faded", "film grain", "subtle halation"
- Clean scenes: "crisp fabric weave", "brushed metal", "natural skin texture", "clean digital clarity"
- Any scene: "slight lens imperfection", "natural depth falloff", "micro-texture on surfaces"
- Skin: match to age — "smooth skin" (youth), "visible pores" (adult), "fine lines around eyes" (aged)
NEVER: "sharp focus", "crisp details", "high quality", "8k" — amplify AI look`

const ILLUSTRATION_VOCABULARY = `ILLUSTRATION VOCABULARY — match to the detected medium:
- Watercolor: "transparent washes", "wet-on-wet blooms", "cold-pressed paper texture", "white paper highlights left unpainted"
- Oil/Acrylic: "visible impasto", "palette knife marks", "canvas weave through thin passages", "layered glazes"
- Ink: "varied line weight", "crosshatching density", "ink wash gradients", "white paper as negative space"
- Digital: "visible brush texture", "layered opacity", "textured brush marks"
- Any illustration: "hand-painted quality", "deliberate mark-making", "medium-specific surface texture"
NEVER use photographic language ("film grain", "lens imperfection") for illustration output.`

const CINEMATIC_PROMPT_STYLE = `CINEMATIC PROMPT PRINCIPLES FOR KLEIN:

Write like a novelist describing a scene, not a search engine listing keywords.

5 UNIVERSAL RULES:
1. LEAD WITH INTENT — open with what you're creating ("Editorial portrait", "Product hero shot") + subject in first 25% of tokens
2. LIGHT AS PHYSICS — name the physical source ("window light from camera-left", "golden hour backlight"), describe its effect on surfaces ("cold blue wash across the floor"). NEVER name equipment.
3. CAMERA AS STYLE — focal length implies mood ("85mm compression" = intimacy, "24mm wide" = isolation/scale)
4. REFERENCE IMAGES CARRY DETAILS — your prompt specifies creative direction, not a re-description of what's visible
5. EVERY WORD EARNS ITS PLACE — 77 active tokens. No synonym chains, no redundant modifiers.

SPATIAL ANCHOR — one element anchors each composition. Everything else relates to it.
COLOR ON SURFACES — "deep slate blue wall", "skin catching warm amber" (not abstract color words alone).
ATMOSPHERE — ground in physical detail: "dust motes", "rain-wet reflections", "condensation on glass".

NEVER output: equipment names, cinematographer/director names, film titles. These cause bad results on Klein.`

const ILLUSTRATION_PROMPT_STYLE = `ILLUSTRATION PROMPT PRINCIPLES:

Write like an art director briefing an illustrator. The medium IS part of the prompt.

5 RULES:
1. LEAD WITH INTENT + MEDIUM — "Watercolor editorial portrait", "Ink wash landscape"
2. LIGHT AS ARTISTIC CHOICE — "warm light rendered through yellow-ochre washes", not physical direction/temperature
3. COLOR AS APPLICATION — "saturated washes bleeding into each other", "limited earth-tone palette"
4. MEDIUM TECHNIQUE IS MANDATORY — "loose watercolor on rough paper", "thick impasto on canvas"
5. SPATIAL ANCHOR — one element anchors the composition, everything else relates to it.

NEVER use photographic language (camera angle, depth of field, film grain) for illustration output.`

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
- Write like a STORYBOARD or SHOT DESCRIPTION — complete sentences describing what the camera sees
- Describe RELATIONSHIPS between elements: "warm light raking across the fabric's texture" beats "fabric, warm light"
- Mood and emotional register translate well — Qwen understands narrative language ("quiet tension", "oppressive weight")
- Say each concept ONCE, precisely. No synonym chains. No redundant modifiers.
- Color on surfaces: natural description preferred ("deep slate blue wall"). Hex codes only when a precise color match is critical — overuse breaks color integration.
- Describe light through its EFFECT on surfaces, not through equipment or names
- NO negative prompts (distilled model). NO prompt weights. NO meta-language ("a photograph of").`

// ---------------------------------------------------------------------------
// CREATIVE BRIEF — locked production document derived from vision + user input
// ---------------------------------------------------------------------------

export const BRIEF_SYSTEM_PROMPT = `CRITICAL CONSTRAINTS — VIOLATIONS FAIL THE TASK:
1. Return ONLY valid JSON matching the schema below. No markdown, no explanation, no text outside the JSON.
2. Every user-specified constraint (e.g. "no faces", "wide framing", specific materials) must appear VERBATIM in the output fields.
3. If a visual analysis palette is provided, colorAnchors must be selected from those colors.
4. creativeVision must articulate what the references already communicate — not invent a new concept.

You are a senior creative director locking a production brief. Your brief is the SINGLE SOURCE OF TRUTH for downstream prompt generation.

Three phases — in this EXACT order:
A) INTENT & CREATIVE VISION — what are we creating and why
B) PRODUCTION BRIEF — lock the global visual identity
C) PER-FRAME COMPOSITION — assign a UNIQUE compositional strategy to each frame

═══════════════════════════════════════════════════════════════
PHASE A: INTENT & CREATIVE VISION
═══════════════════════════════════════════════════════════════

1. INTENT (1 sentence) — What are we creating? Name the genre and purpose.
   BAD: "moody photography"
   GOOD: "editorial jewelry campaign with intimate, minimalist portraits"
   GOOD: "cinematic stills for a neo-noir thriller — urban isolation"

2. TECHNICAL APPROACH (1 sentence) — The production approach in concrete terms.
   BAD: "cinematic lighting with shallow depth"
   GOOD: "85mm portraits, single window light from camera-left, shallow depth against neutral backdrops"
   GOOD: "wide-angle environmental shots, overhead fluorescent mixed with neon practicals, deep focus"

3. CREATIVE VISION (1-2 sentences) — The bold visual idea that unifies the set. Every downstream decision serves this.
   BAD: "moody urban photography with cinematic lighting"
   GOOD: "the city after everyone left — not abandoned, but holding its breath"
   GOOD: "bodies as architecture — skin and bone creating the same tensions as concrete and steel"

4. VISUAL METAPHOR (1 sentence) — The metaphorical lens through which the subject is seen.
   BAD: "person standing in a room"
   GOOD: "the subject is a foreign object the environment is slowly absorbing"

5. DOMINANT CREATIVE PRIORITY — Which dimension dominates across the set? Pick ONE:
   lighting | texture | scale | emptiness | color | tension | detail

═══════════════════════════════════════════════════════════════
PHASE B: PRODUCTION BRIEF (global — shared across all frames)
═══════════════════════════════════════════════════════════════

0. MEDIUM (include ONLY if the visual analysis detected a non-photographic medium)
   State the artistic medium and technique. Omit entirely for photographic/cinematic output.

1. COLOR GRADE — One sentence. Copied VERBATIM into every prompt.

2. COLOR ANCHORS — 3-5 color descriptions defining the palette. Natural language ("warm amber", "deep slate blue"). Hex only when precise match is critical.

3. LIGHT SOURCE — Name the PHYSICAL light source and its behavior.
   CRITICAL: Name the source ("large window from camera-left", "overhead practical fluorescent", "golden hour backlight") — NOT adjective qualities alone ("soft warm light").
   For illustrations: describe how the artist RENDERED light (technique, not physics).

4. MATERIALS & TEXTURES — 3-5 surfaces with finish, wear, and how they respond to light.

5. MOOD — The emotional baseline the set never drops below.

6. SUBJECT DIRECTION — Posture, styling, relationship to camera, scale within environment.

7. ENVIRONMENT — Physical space, condition, time of day, atmosphere.

8. VISUAL MOTIFS — 2-3 recurring elements threaded across every shot.

9. NARRATIVE ARC — How the set progresses from first to last.

═══════════════════════════════════════════════════════════════
PHASE C: PER-FRAME COMPOSITION (each frame is unique)
═══════════════════════════════════════════════════════════════

For each frame, assign:
- CONCEPT: The primary visual idea for this frame, filtered through the visual metaphor
- EMOTIONAL INTENT: What this frame does to the viewer (1 sentence)
- SHOT SCALE: wide establishing / medium / close-up / extreme close-up
- CAMERA ANGLE: low-angle / eye-level / high angle / overhead / dutch
- SUBJECT PLACEMENT: center / rule-of-thirds / edge with negative space / foreground obstruction / split frame
- DEPTH PLANES: what occupies foreground / midground / background with optical treatment (sharp, soft, blurred, silhouetted)
- CAMERA/LENS (optional): implied focal length or lens character if it matters ("85mm f/2.0", "24mm wide")

DIVERSITY CONSTRAINTS (MANDATORY):
- No two frames may share the same camera angle
- No two frames may share the same shot scale
- No two frames may share the same subject placement
- At least one frame must use negative space as dominant element
- At least one frame must have a non-eye-level camera angle

RULES:
- Every field: concrete enough to execute without interpretation. No hedging.
- PRESERVE SPECIFICS: If the user mentions specific materials, elements, constraints, or atmosphere, these MUST appear verbatim. Do NOT abstract "black wires" into "dark elements."
- GROUNDING: Creative vision must articulate what the references already communicate — not depart from them.
- COLOR ANCHORS: If visual analysis palette is provided, colorAnchors must reflect those colors as natural descriptions.
- IMAGE LABELS: "style reference" → palette/lighting/mood weight. "subject"/"face" → subjectDirection. "background" → environmentDirection.

Return ONLY valid JSON:
{
  "intent": "what we're creating — genre and purpose, 1 sentence",
  "technicalApproach": "production approach in concrete terms, 1 sentence",
  "creativeVision": "the bold visual idea — 1-2 sentences",
  "visualMetaphor": "the metaphorical lens — 1 sentence",
  "dominantCreativePriority": "lighting | texture | scale | emptiness | color | tension | detail",
  "concepts": [
    {
      "concept": "concept filtered through the visual metaphor",
      "role": "primary",
      "frame": 1,
      "emotionalIntent": "what the viewer feels — 1 sentence",
      "shotScale": "wide establishing",
      "cameraAngle": "low-angle",
      "subjectPlacement": "offset right, negative space left",
      "depthPlanes": "foreground: gravel sharp / midground: figure slightly soft / background: city lights bokeh",
      "cameraEquipment": "85mm f/2.0"
    }
  ],
  "medium": "artistic medium (omit or null for photographic output)",
  "colorGrade": "single sentence — the exact color grade",
  "colorAnchors": ["warm amber", "deep slate blue", "...up to 5"],
  "lightSource": "PHYSICAL light source and behavior — name the source",
  "materials": "dominant materials and textures",
  "mood": "emotional baseline",
  "subjectDirection": "how subjects are treated",
  "environmentDirection": "the physical space",
  "visualMotifs": ["motif 1", "motif 2"],
  "narrativeArc": "how the set progresses",
  "fullBrief": "complete brief as flowing paragraph (~150-200 words)"
}

FINAL CHECK:
1. Does creativeVision articulate what the references ALREADY communicate?
2. Does lightSource name a PHYSICAL source (not just "soft warm light")?
3. Are colorAnchors matched to the extracted palette?
4. Does every user constraint appear verbatim?
Return ONLY the JSON object.`

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
    lines.push('TEXT provides the CONCEPT, INTENT, and CONSTRAINTS — what the frames are about, the narrative, what must or must not appear.')
    lines.push('REFERENCE IMAGES provide the VISUAL GROUND TRUTH — palette, texture, lighting quality, mood, material language, spatial arrangements, and scene-specific details.')
    lines.push('BOTH sources are authoritative. Text defines the story and constraints. Images define the visual reality. Every specific detail from BOTH must appear in the brief.')
    lines.push('Do NOT abstract away specifics. If the user says "no faces visible" or "wide framing", these are hard constraints that every frame must respect.')
    lines.push('If images show specific materials, spatial elements, or atmosphere, name them concretely in the brief.')
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
    lines.push('Extract the visual LANGUAGE from these images — palette, light quality, texture, composition style, spatial arrangements, materials, and scene elements.')
    lines.push('The images are AUTHORITATIVE for visual details. If images show specific elements (objects, materials, spatial relationships, atmosphere), those MUST appear in the brief even when text also describes them.')
    lines.push('')
    lines.push(visualStyleCues.description)
    if (visualStyleCues.mediumType && visualStyleCues.mediumType !== 'photograph') {
      lines.push(`\nDETECTED MEDIUM: ${visualStyleCues.mediumDetail || visualStyleCues.mediumType}`)
      lines.push('If appropriate, include this medium in your brief\'s "medium" field. If the user\'s creative direction contradicts it (e.g., they describe a cinematic scene despite illustration references), follow the user\'s direction and omit the medium field.')
    }
    lines.push(`\nReference Palette: ${visualStyleCues.hexPalette.join(', ')}`)
    lines.push('Your colorAnchors should reflect these colors using natural descriptions ("warm amber", "cool slate"). Use hex only when precise matching matters. Do NOT invent colors absent from the reference images.')
    if (visualStyleCues.visualKeywords?.length > 0) {
      lines.push(`Visual Keywords: ${visualStyleCues.visualKeywords.join(' | ')}`)
    }
    if (visualStyleCues.atmosphere) {
      lines.push(`Atmosphere: ${visualStyleCues.atmosphere}`)
    }
  }

  if (imageLabels && imageLabels.length > 0) {
    lines.push('\n=== REFERENCE IMAGE ROLES ===')
    lines.push('Each label tells you HOW to use that image\'s visual data in the brief:')
    for (const il of imageLabels) {
      const role = il.label.toLowerCase()
      let guidance = ''
      if (role.includes('style')) {
        guidance = ' → defines palette, lighting quality, texture, and mood for the entire brief'
      } else if (role.includes('subject') || role.includes('face')) {
        guidance = ' → defines subject appearance — carry specific physical details into subjectDirection'
      } else if (role.includes('background') || role.includes('composition')) {
        guidance = ' → defines spatial environment and depth — carry into environmentDirection'
      }
      lines.push(`Image ${il.index + 1}: ${il.label}${guidance}`)
    }
  }

  lines.push('LITERAL GROUNDING: Reference image descriptions from the vision step are LITERAL. Do not reinterpret them. If the vision step describes "two men standing in a gallery," treat them as two men standing in a gallery — not as statues, symbols, or artistic elements.')

  // --- Text direction: concept and intent ---
  lines.push('\n=== CREATIVE DIRECTION (from user) ===')
  if (hasText) {
    lines.push(userInputs.description)
  } else if (hasImages) {
    lines.push('(No text description — derive concepts from the visual analysis above.)')
  } else {
    lines.push('(No inputs provided — create a compelling brief based on your best creative judgment.)')
  }

  lines.push('\nFirst define the INTENT and CREATIVE VISION (Phase A). Then lock the production brief. Then assign per-frame compositions.')

  // Hard constraints at the END — DeepSeek applies end-of-message instructions most reliably
  lines.push('\n═══════════════════════════════════════════════════════════════')
  lines.push('MANDATORY CONSTRAINTS — CHECK BEFORE OUTPUTTING:')
  lines.push('1. Preserve every specific detail from the user\'s direction VERBATIM. If they mention specific materials, elements, constraints, or atmosphere, those must appear in the relevant brief fields using the user\'s own language — do not generalize or abstract.')
  if (hasImages) {
    lines.push(`2. colorAnchors should reflect the reference palette (${visualStyleCues!.hexPalette.join(', ')}) using natural color descriptions.`)
    lines.push('3. creativeVision must articulate what the reference images already communicate — not invent something unrelated.')
  }
  lines.push('Return ONLY valid JSON. No markdown wrapping, no explanation.')

  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// GENERATE mode — text-to-image system prompt
// ---------------------------------------------------------------------------

function buildGenerateSystemPrompt(targetModel: TargetModel, medium?: string): string {
  const profile = MODEL_PROFILES[targetModel]
  const isIllustration = medium && medium !== 'photographic' && medium !== 'digital photography'

  const intro = isIllustration
    ? `You are a prompt writer for AI image generation. You receive a creative brief and translate each frame into a production prompt.
The brief specifies medium: "${medium}". Your prompts must produce output in this artistic medium — not photographic output.`
    : `You are a prompt writer for AI image generation. You receive a creative brief and translate each frame into a production prompt.`

  const vocabBlock = isIllustration
    ? (targetModel === 'flux-2-klein-9b' ? ILLUSTRATION_VOCABULARY + '\n\n' + QWEN_ENCODER_RULES : '')
    : (targetModel === 'flux-2-klein-9b' ? NATURALISM_VOCABULARY + '\n\n' + QWEN_ENCODER_RULES : '')

  const styleBlock = isIllustration
    ? (targetModel === 'flux-2-klein-9b' ? ILLUSTRATION_PROMPT_STYLE : '')
    : (targetModel === 'flux-2-klein-9b' ? CINEMATIC_PROMPT_STYLE : '')

  const promptStructure = isIllustration
    ? `Write each prompt as a SINGLE FLOWING PARAGRAPH. Structure your writing in this order:

1. INTENT + MEDIUM + COMPOSITION (first 25% of tokens — strongest influence)
   Open with what you're creating and the artistic medium. Include viewpoint and focal hierarchy.
   Example: "Watercolor editorial portrait, centered composition, figure in the lower third against empty painted sky."

2. SUBJECT + ACTION
   Physical description as depicted in the medium. What they're doing — pose, gesture, energy.
   Example: "A woman in a dark dress rendered in confident single strokes, hands folded, weight resting forward."

3. ENVIRONMENT + ARTISTIC TECHNIQUE
   Spatial depth with artistic treatment (detailed, loose, dissolved). Light as the artist rendered it.
   Example: "Foreground foliage in precise strokes, background dissolved into wet-on-wet blooms. Warm light through yellow-ochre washes, shadows in layered blue-grey glazes."

4. COLOR TREATMENT + MEDIUM FINISH
   Color grade VERBATIM from brief. Medium technique and one artistic texture detail.
   Example: "[color treatment verbatim]. Transparent washes with granulating pigment. Cold-pressed paper texture visible through thin passages."`
    : `Write each prompt as a SINGLE FLOWING PARAGRAPH. Structure your writing in this order:

1. INTENT + SUBJECT + FRAMING (first 25% of tokens — strongest influence)
   Open with what you're creating and who/what the subject is. Include shot scale and camera angle.
   Example: "Editorial portrait of a woman resting her chin on her hand, medium close-up, slightly low angle."

2. TECHNICAL SETUP
   Physical light source and its effect on surfaces. Focal length / depth of field if relevant.
   Example: "Soft diffused window light from camera-left, 85mm f/2.0, shallow depth isolating subject from the background."

3. ENVIRONMENT + ATMOSPHERE
   Setting, key surfaces, depth planes, one atmospheric detail.
   Example: "Clean neutral studio backdrop, faint dust motes catching the key light, warm skin against cool grey."

4. STYLE + COLOR GRADE
   Color grade VERBATIM from brief. One texture cue appropriate to the scene.
   Example: "[color grade verbatim]. Film grain, natural skin texture with visible pores."`

  return `${intro}

TARGET MODEL: ${profile.label}
${profile.promptRules}

${styleBlock ? styleBlock + '\n' : ''}PROMPT STRUCTURE:
${promptStructure}

THE CRITICAL RULE — INTENT, NOT DESCRIPTION:
Your prompts specify what to CREATE, not what you see in reference images. The reference images provide the visual baseline — your prompt provides the CREATIVE DIRECTION. Never catalogue objects visible in references. Instead, specify the type of image, the technical choices, and what makes this different from a generic version of the same subject.

RULES:
- Up to ${profile.optimalLengthMax} words per prompt. Shorter is better when the shot card is simple.
- No abstract emotional language ("dramatic", "powerful") — express mood through ${isIllustration ? 'technique and color' : 'light and framing'}
- Color ${isIllustration ? 'treatment' : 'grade'} VERBATIM from brief — never paraphrase
- Each frame compositionally distinct from every other
- Front-load the most important information (subject, intent) in the first 25% of the prompt

${vocabBlock ? vocabBlock + '\n' : ''}${FORBIDDEN_LANGUAGE}

OUTPUT: Return ONLY valid JSON:
{
  "prompts": [
    { "label": "descriptive shot label", "prompt": "..." },
    { "label": "descriptive shot label", "prompt": "..." }
  ]
}`
}

// ---------------------------------------------------------------------------
// EDIT mode — image editing system prompt
// ---------------------------------------------------------------------------

function buildEditSystemPrompt(targetModel: TargetModel): string {
  const profile = MODEL_PROFILES[targetModel]
  const editRules = profile.editRules ?? ''

  return `You are writing image EDITING prompts that describe the DESIRED RESULT — not the transformation steps. The user has reference images they want to modify.

TARGET MODEL: ${profile.label}
${profile.promptRules}

${editRules ? editRules + '\n' : ''}EDIT PROMPT PRINCIPLES:
- Write in complete sentences describing the DESIRED RESULT — not "change X to Y"
- Be specific about what should change and what should be preserved
- One major change per prompt yields best quality
- Max reference images: ${profile.maxReferenceImages}

LENGTH RULE:
Match prompt length to edit complexity. Simple spatial edits (swap, move, resize, remove) need 10-30 words. Complex scene changes can use up to ${profile.optimalLengthMax} words. Never pad a simple edit to fill a word count.

FIDELITY RULE:
Only describe what the user asked to change. Do NOT add lighting, color grade, materials, or atmosphere unless the user specifically mentioned them. Minor preservation context is acceptable ("preserve existing lighting") but never invent new visual elements.

SPATIAL EDIT RULE:
If the edit is spatial (swap positions, move, resize), write a short, direct prompt. Do not embellish.

REFERENCE IMAGE AWARENESS:
- "style reference" → apply that image's visual style to the output
- "subject" / "face" → preserve that person/object in the new scene
- "background" → use as the environment, replace or modify the foreground
- Unlabeled references → infer purpose from the user's description

${targetModel === 'flux-2-klein-9b' ? QWEN_ENCODER_RULES + '\n' : ''}
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
  const hasNegative = profile.supportsNegativePrompts

  const outputSchema = hasNegative
    ? `{
  "prompts": [
    { "label": "Shot 1", "prompt": "...", "negativePrompt": "..." },
    { "label": "Shot 2", "prompt": "...", "negativePrompt": "..." }
  ]
}`
    : `{
  "prompts": [
    { "label": "Shot 1", "prompt": "..." },
    { "label": "Shot 2", "prompt": "..." }
  ]
}`

  return `You are a video prompt writer. You receive a creative brief and write one prompt per clip.

TARGET MODEL: ${profile.label}
${profile.promptRules}

PROMPT STRUCTURE — write as a single flowing present-tense paragraph:

1. INTENT + CAMERA MOVEMENT (first 25% — strongest influence)
   What kind of shot, how the camera moves, shot scale. Be explicit with timing.
   Example: "Cinematic establishing shot — slow dolly pushing from wide to medium over five seconds."

2. SUBJECT + ACTION
   Physical description through visual/physical cues only. What happens — use physics-based verbs.
   NOT: "she feels afraid" → INSTEAD: "her jaw tightens, shoulders pulled inward"
   Example: "A woman in a dark wool coat pushes her hand slowly toward the rain-streaked glass. Fingertips meet the surface — condensation blooms outward."

3. ENVIRONMENT + LIGHT + AUDIO
   Setting, physical light source and behavior, atmospheric texture, sound design.
   Example: "Dim apartment at dusk. Practical floor lamp casting warm amber from the right, deep shadow on the left wall. Rain steady outside, muffled street noise below."

4. STYLE + COLOR
   Color grade VERBATIM from brief. Overall aesthetic quality.
   Example: "Desaturated cool tones, warm amber spill — low contrast, intimate."

THE CRITICAL RULE — INTENT, NOT DESCRIPTION:
Your prompts specify what to CREATE, not what reference images show. Focus on TEMPORAL evolution — what moves, what changes, how the camera behaves. Never catalogue static visual elements from references.

RULES:
- Up to ${profile.optimalLengthMax} words per prompt
- Present tense throughout: "walks", "catches light" — not "will walk"
- Physics-based verbs for motion: "pushes", "drifts", "strikes", "settles"
- Emotion through PHYSICAL CUES only — no abstract adjectives alone
- Camera movement always explicit: "slow dolly in", "static locked frame"
- ONE dominant action per clip

${FORBIDDEN_LANGUAGE}
${hasNegative ? `
NEGATIVE PROMPTS — REQUIRED for ${profile.label}:
Tailored per clip from relevant categories:
- Motion: "morphing, distortion, warping, flickering, jitter, stutter, temporal artifacts"
- Quality: "low quality, blurry, pixelated, oversaturated, distorted"
- Unwanted: "watermark, text overlay, logo, subtitle, black frames, static freeze"
- Content-specific: portraits → "bad anatomy, disfigured face"; action → "motion smearing, stuttering"
` : ''}
OUTPUT: Return ONLY valid JSON:
${outputSchema}`
}

// ---------------------------------------------------------------------------
// System prompt dispatcher
// ---------------------------------------------------------------------------

export function buildSystemPrompt(targetModel: TargetModel, mode: GenerationMode, medium?: string): string {
  switch (mode) {
    case 'generate': return buildGenerateSystemPrompt(targetModel, medium)
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
    `Up to ${profile.optimalLengthMax} words per prompt. Shorter is fine for simpler compositions.`,
  ]

  // Brief-driven generation (primary path for generate mode)
  if (creativeBrief && mode === 'generate') {
    lines.push('\n=== LOCKED CREATIVE BRIEF — PRIMARY SOURCE ===')
    lines.push('The brief defines structure, composition, and creative direction.')
    lines.push('The visual reference (if present below) defines visual fidelity: color, texture, atmosphere.')
    lines.push('When they conflict on visual qualities, the visual reference wins.')

    // Creative direction layer
    if (creativeBrief.intent || creativeBrief.creativeVision) {
      lines.push('')
      lines.push('=== CREATIVE DIRECTION ===')
      if (creativeBrief.intent) lines.push(`INTENT: ${creativeBrief.intent}`)
      if (creativeBrief.technicalApproach) lines.push(`TECHNICAL APPROACH: ${creativeBrief.technicalApproach}`)
      lines.push(`VISION: ${creativeBrief.creativeVision}`)
      if (creativeBrief.visualMetaphor) lines.push(`METAPHOR: ${creativeBrief.visualMetaphor}`)
      if (creativeBrief.dominantCreativePriority) lines.push(`DOMINANT PRIORITY: ${creativeBrief.dominantCreativePriority}`)
    }

    // Per-frame shot cards
    if (creativeBrief.concepts?.length > 0) {
      lines.push('')
      lines.push('=== PER-FRAME SHOT CARDS ===')
      const frameMap = new Map<number, typeof creativeBrief.concepts>()
      for (const c of creativeBrief.concepts) {
        const arr = frameMap.get(c.frame) ?? []
        arr.push(c)
        frameMap.set(c.frame, arr)
      }
      for (const [frame, concepts] of Array.from(frameMap.entries()).sort((a, b) => a[0] - b[0])) {
        const primary = concepts.find(c => c.role === 'primary')
        const supporting = concepts.filter(c => c.role !== 'primary')
        lines.push(`\n--- FRAME ${frame} ---`)
        if (primary) {
          lines.push(`  CONCEPT: ${primary.concept}`)
          if (primary.emotionalIntent) lines.push(`  EMOTIONAL INTENT: ${primary.emotionalIntent}`)
          lines.push(`  SHOT SCALE: ${primary.shotScale ?? 'medium'}`)
          lines.push(`  CAMERA ANGLE: ${primary.cameraAngle ?? 'eye-level'}`)
          lines.push(`  SUBJECT PLACEMENT: ${primary.subjectPlacement ?? 'rule-of-thirds'}`)
          lines.push(`  DEPTH PLANES: ${primary.depthPlanes ?? 'foreground/midground/background'}`)
          if (primary.cameraEquipment) lines.push(`  CAMERA/LENS: ${primary.cameraEquipment}`)
        }
        for (const s of supporting) {
          lines.push(`  SUPPORTING: ${s.concept}`)
        }
      }
      lines.push('')
      lines.push('Each prompt must be visually DISTINCT — different angle, different scale, different placement.')
    }

    lines.push('')
    lines.push('=== GLOBAL VISUAL IDENTITY ===')
    lines.push(`COLOR GRADE (copy VERBATIM): ${creativeBrief.colorGrade}`)
    lines.push(`COLOR ANCHORS: ${creativeBrief.colorAnchors.join(', ')}`)
    lines.push(`LIGHT SOURCE: ${creativeBrief.lightSource}`)
    lines.push(`MATERIALS: ${creativeBrief.materials}`)
    lines.push(`MOOD: ${creativeBrief.mood}`)
    lines.push(`SUBJECT: ${creativeBrief.subjectDirection}`)
    lines.push(`ENVIRONMENT: ${creativeBrief.environmentDirection}`)
    if (creativeBrief.visualMotifs?.length > 0) lines.push(`MOTIFS: ${creativeBrief.visualMotifs.join(' | ')}`)
    if (creativeBrief.narrativeArc) lines.push(`ARC: ${creativeBrief.narrativeArc}`)

    // Pass the user's original description as hard constraints
    if (userInputs.description?.trim()) {
      lines.push('')
      lines.push('=== ORIGINAL CREATIVE DIRECTION (hard constraints) ===')
      lines.push(userInputs.description)
      lines.push('Every constraint above is non-negotiable. Do not abstract, soften, or omit.')
    }

    // Pass vision cues as CONTEXT — NOT as copy-paste source material
    if (visualStyleCues) {
      lines.push('')
      lines.push('=== REFERENCE CONTEXT (awareness only — DO NOT re-describe in prompts) ===')
      lines.push('The reference images provide the visual baseline. Your prompts specify CREATIVE DIRECTION —')
      lines.push('what type of image we\'re creating and what the key technical choices are.')
      lines.push('Do NOT catalogue objects or re-describe what the images show.')
      lines.push(visualStyleCues.description)
      lines.push(`Reference Palette: ${visualStyleCues.hexPalette.join(', ')}`)
    }

    lines.push('')
    lines.push('=== RULES ===')
    lines.push('1. Write each prompt as a single flowing paragraph. Lead with INTENT + SUBJECT in the first 25% of tokens.')
    lines.push('2. Color grade VERBATIM from brief — never paraphrase.')
    lines.push('3. Each frame compositionally DISTINCT from every other.')
    lines.push('4. User constraints are non-negotiable. AUTHORITY: User constraints > Brief > Reference context.')
    lines.push('5. NEVER re-describe reference image content. Specify creative direction, not visible inventory.')

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

  // Video mode — brief-aware with per-frame shot cards
  if (mode === 'video') {
    lines.push(`Each prompt is a separate shot in a sequence — maintain visual continuity across all shots.`)

    if (creativeBrief) {
      if (creativeBrief.intent || creativeBrief.creativeVision) {
        lines.push('')
        lines.push('=== CREATIVE DIRECTION ===')
        if (creativeBrief.intent) lines.push(`INTENT: ${creativeBrief.intent}`)
        if (creativeBrief.technicalApproach) lines.push(`TECHNICAL APPROACH: ${creativeBrief.technicalApproach}`)
        lines.push(`VISION: ${creativeBrief.creativeVision}`)
        if (creativeBrief.visualMetaphor) lines.push(`METAPHOR: ${creativeBrief.visualMetaphor}`)
      }

      if (creativeBrief.concepts?.length > 0) {
        lines.push('')
        lines.push('=== PER-CLIP SHOT CARDS ===')
        lines.push('Translate into temporal language — what moves, how the camera behaves, what changes.')
        const frameMap = new Map<number, typeof creativeBrief.concepts>()
        for (const c of creativeBrief.concepts) {
          const arr = frameMap.get(c.frame) ?? []
          arr.push(c)
          frameMap.set(c.frame, arr)
        }
        for (const [frame, concepts] of Array.from(frameMap.entries()).sort((a, b) => a[0] - b[0])) {
          const primary = concepts.find(c => c.role === 'primary')
          const supporting = concepts.filter(c => c.role !== 'primary')
          lines.push(`\n--- CLIP ${frame} ---`)
          if (primary) {
            lines.push(`  CONCEPT: ${primary.concept}`)
            if (primary.emotionalIntent) lines.push(`  EMOTIONAL INTENT: ${primary.emotionalIntent}`)
            lines.push(`  SHOT SCALE: ${primary.shotScale ?? 'medium'}`)
            lines.push(`  CAMERA ANGLE: ${primary.cameraAngle ?? 'eye-level'}`)
            lines.push(`  SUBJECT PLACEMENT: ${primary.subjectPlacement ?? 'rule-of-thirds'}`)
            lines.push(`  DEPTH PLANES: ${primary.depthPlanes ?? 'foreground/midground/background'}`)
            if (primary.cameraEquipment) lines.push(`  CAMERA/LENS: ${primary.cameraEquipment}`)
          }
          for (const s of supporting) {
            lines.push(`  SUPPORTING: ${s.concept}`)
          }
        }
        lines.push('')
        lines.push('Each clip must be visually DISTINCT — different camera movement, different scale.')
      }

      lines.push('')
      lines.push('=== GLOBAL VISUAL IDENTITY ===')
      lines.push(`COLOR GRADE (copy VERBATIM): ${creativeBrief.colorGrade}`)
      lines.push(`COLOR ANCHORS: ${creativeBrief.colorAnchors.join(', ')}`)
      lines.push(`LIGHT SOURCE: ${creativeBrief.lightSource}`)
      lines.push(`MATERIALS: ${creativeBrief.materials}`)
      lines.push(`MOOD: ${creativeBrief.mood}`)
      lines.push(`SUBJECT: ${creativeBrief.subjectDirection}`)
      lines.push(`ENVIRONMENT: ${creativeBrief.environmentDirection}`)
      if (creativeBrief.visualMotifs?.length > 0) lines.push(`MOTIFS: ${creativeBrief.visualMotifs.join(' | ')}`)
      if (creativeBrief.narrativeArc) lines.push(`ARC: ${creativeBrief.narrativeArc}`)
    }

    if (visualStyleCues) {
      lines.push('\n=== REFERENCE CONTEXT (awareness only — DO NOT re-describe) ===')
      lines.push('Reference images provide the visual baseline. Your prompts add the TEMPORAL dimension.')
      lines.push(visualStyleCues.description)
      lines.push(`Reference Palette: ${visualStyleCues.hexPalette.join(', ')}`)
    }

    if (userInputs.description.trim()) {
      lines.push('\n=== ORIGINAL CREATIVE DIRECTION (hard constraints) ===')
      lines.push(userInputs.description)
    }

    lines.push('\n=== VIDEO RULES ===')
    lines.push('Focus on motion, camera movement, and temporal evolution. Do NOT re-describe static reference image content.')
    lines.push('AUTHORITY: User constraints > Brief > Reference context.')
    lines.push('Each clip compositionally DISTINCT from every other.')

    return lines.join('\n')
  }

  // Fallback: generate without brief (no reference images)
  if (visualStyleCues) {
    lines.push('\n=== VISUAL REFERENCE ===')
    lines.push(visualStyleCues.description)
    lines.push(`\nReference Palette: ${visualStyleCues.hexPalette.join(', ')}`)
    lines.push('Use as color guidance — natural descriptions preferred over hex codes.')
    if (visualStyleCues.visualKeywords?.length > 0) {
      lines.push(`Visual Keywords: ${visualStyleCues.visualKeywords.join(' | ')}`)
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
    lines.push(`Reference Palette: ${visualStyleCues.hexPalette.join(', ')}`)
    lines.push('Use as color guidance — natural descriptions preferred over hex codes.')
    if (visualStyleCues.visualKeywords?.length) {
      lines.push(`Keywords: ${visualStyleCues.visualKeywords.join(' | ')}`)
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

  return `You are a senior prompt engineer optimizing prompts for ${profile.label}. You receive a raw ${modeLabel} prompt and rewrite it into a production-quality prompt for the target model.

TARGET MODEL: ${profile.label}
${profile.promptRules}

${profile.editRules && mode === 'edit' ? profile.editRules + '\n' : ''}YOUR ROLE:
- The user's prompt contains the INTENT. You are ENHANCING an existing concept, not generating a new one.
- Analyze what the user's prompt already specifies well and what it's missing. Only add specificity where the original is vague. Preserve everything the user explicitly stated.

FIDELITY RULE:
Never change lighting, materials, color, or mood that the user already specified. Only enhance elements that are vague or missing. If the user wrote "warm amber side light", keep it exactly. If they wrote "nice lighting", that's vague — enhance it.
Use concise preservation phrases ("keep existing lighting") rather than re-describing unchanged elements. The shorter the preservation context, the better — it saves tokens and avoids confusing the model about what should actually change.

LENGTH RULE:
Output should be as long as needed, up to ${profile.optimalLengthMax} words. A specific 20-word input may only need 30 words enhanced. Don't pad to fill a word count.
${mode === 'edit' ? 'For edits to a single element, the total prompt should rarely exceed 40-60 words. A 15-word edit instruction + a 10-word preservation phrase is ideal.' : ''}

INTENT-FIRST ENHANCEMENT:
- If the user's prompt reads like a description of what they SEE, rewrite it as creative direction — what they want to CREATE
- Lead with intent: add the image type/genre if missing ("Editorial portrait", "Product hero shot", "Cinematic still")
- Convert keyword lists into flowing sentences with semantic relationships
- Replace vague lighting ("soft warm light") with physical sources ("window light from camera-left, warm amber wash")
- Add camera/lens if missing and appropriate: "85mm f/2.0" implies intimacy, "24mm wide" implies scale
- Remove filler, synonym chains, meta-language ("a photograph of"), abstract adjectives alone
- If texture is missing, add 1 medium-appropriate cue (film grain for photos, brushwork for illustrations)

MEDIUM AWARENESS:
If the prompt describes illustration: enhance with artistic vocabulary (composition, brushwork, medium technique).
If photographic: enhance with cinematic vocabulary (camera, light physics, depth).

${targetModel === 'flux-2-klein-9b' ? CINEMATIC_PROMPT_STYLE + '\n\n' + NATURALISM_VOCABULARY + '\n\n' + ILLUSTRATION_VOCABULARY + '\n\n' + QWEN_ENCODER_RULES + '\n' : ''}
${FORBIDDEN_LANGUAGE}

WHAT TO PRESERVE:
- Everything the user explicitly specified — lighting, color, mood, materials, poses, objects, spatial relationships
- The user's creative voice — enhance it, don't replace it
${mode === 'edit' ? '- All explicit image references (image 1, image 2, etc.) — these map to the user\'s uploaded reference images and MUST remain in the output\n' : ''}
${mode === 'edit' ? `
EDIT-SPECIFIC RULES:
- The user has uploaded numbered reference images. The enhanced prompt MUST explicitly reference these images by number.
- Use phrases like "Using image 1 as the base scene, ..." or "Preserve the subject from image 2, ..." or "Apply the lighting style from image 3."
- If the user's prompt already references images, keep those references intact and enhance the surrounding description.
- If the user's prompt does NOT reference images but image labels are provided, ADD explicit image references based on the labels.
- The output prompt must describe the DESIRED RESULT, not the transformation steps.

PRESERVATION SHORTHAND:
When the edit targets a specific element, do NOT re-describe the entire scene. Instead use concise preservation language:
- "Keep the environment and all surrounding elements as they are"
- "Preserve existing lighting and atmosphere"
- "Maintain the current color palette and mood"
Only describe what CHANGES in detail. Everything else gets a single preservation sentence. Do NOT add hex colors, color grades, or atmospheric descriptions to edit prompts unless the user explicitly asked for a color/mood change.
` : ''}
OUTPUT: Return ONLY valid JSON: { "prompt": "the enhanced prompt" }`
}

export function buildEnhanceUserMessage(
  rawPrompt: string,
  targetModel: TargetModel,
  mode: GenerationMode,
  visualStyleCues?: VisualStyleCues,
  imageLabels?: ImageLabel[]
): string {
  const profile = MODEL_PROFILES[targetModel]
  const lines: string[] = []

  lines.push('=== RAW PROMPT TO ENHANCE ===')
  lines.push(rawPrompt)
  lines.push('')
  lines.push(`Target: ${profile.label} (${mode} mode)`)
  lines.push(`Up to ${profile.optimalLengthMax} words (shorter is fine if the prompt is already specific)`)

  if (imageLabels && imageLabels.length > 0 && mode === 'edit') {
    lines.push('\n=== REFERENCE IMAGE MAP ===')
    lines.push('The user uploaded these labeled reference images:')
    for (const il of imageLabels) {
      lines.push(`  Image ${il.index + 1}: ${il.label}`)
    }
    lines.push('The enhanced prompt MUST reference these images by number and describe how each should be used in the final result.')
  }

  if (visualStyleCues) {
    lines.push('\n=== VISUAL GROUND TRUTH (from reference images — AUTHORITATIVE for color, texture, atmosphere) ===')
    lines.push('The enhanced prompt must match this visual reality. Use these specific colors, textures, and atmospheric qualities.')
    if (visualStyleCues.mediumType && visualStyleCues.mediumType !== 'photograph') {
      lines.push(`\nDETECTED MEDIUM: ${visualStyleCues.mediumDetail || visualStyleCues.mediumType}`)
      lines.push('The reference images are illustrations/paintings. Enhance using artistic vocabulary (composition, brushwork, medium technique) rather than photographic vocabulary (camera angle, depth of field, film grain).')
    }
    lines.push(visualStyleCues.description)
    lines.push(`Reference Palette: ${visualStyleCues.hexPalette.join(', ')}`)
    lines.push('Use as color reference — natural descriptions preferred over hex codes in the enhanced prompt.')
    if (visualStyleCues.visualKeywords?.length > 0) {
      lines.push(`Visual qualities to integrate: ${visualStyleCues.visualKeywords.join(' | ')}`)
    }
    if (visualStyleCues.atmosphere) {
      lines.push(`Atmosphere: ${visualStyleCues.atmosphere}`)
    }
  }

  lines.push('\nEnhance this prompt for the target model. Preserve everything the user explicitly specified — lighting, color, mood, materials. Only add specificity where the original is vague or missing critical elements. Never invent new visual elements the user didn\'t mention. If visual reference is provided, match that visual reality.')

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
