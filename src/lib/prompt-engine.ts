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

const FORBIDDEN_LANGUAGE = `FORBIDDEN WORDS AND TERMS (never use — these cause bad results):
VAGUE ADJECTIVES: "ethereal", "dreamlike", "magical", "otherworldly", "surreal", "breathtaking",
"whimsical", "fantastical", "enchanted", "mystical", "stunning", "captivating", "mesmerizing",
"awe-inspiring", "hauntingly beautiful", "masterpiece", "best quality", "8k", "ultra HD", "hyperrealistic"
LIGHTING EQUIPMENT (Klein renders these as visible objects): "softbox", "HMI", "key light", "fill light",
"bounce light", "reflector", "diffusion panel", "beauty dish", "ring light", "strobe", "flash",
"light array", "overhead light", "backlight panel" — describe light through its visible EFFECT instead
NAME-DROPPING: Do NOT name cinematographers, directors, or film titles in the prompt — Klein cannot interpret
these as style references. Instead, DESCRIBE the visual quality you want.
SHARPNESS AMPLIFIERS: "sharp focus", "crisp details", "high quality", "ultra detailed" — amplify AI look`

const NATURALISM_VOCABULARY = `NATURALISM VOCABULARY — CRITICAL FOR KLEIN (its 1B flow model over-sharpens and smooths by default):
Every prompt MUST include at least 2 organic texture cues to counteract Klein's synthetic tendencies:
- Skin: "natural skin texture with visible pores", "uneven skin tone", "fine lines around eyes", "subtle sheen on forehead"
- Surface: "scuffed", "patina'd", "rain-spotted", "sun-faded", "dust-settled", "fingerprint-smudged", "cracked", "peeling"
- Film/Analog: "film grain", "subtle halation on highlights", "analog color shift", "gentle vignetting", "slight lens imperfection"
- Environment: "asymmetric composition", "slightly cluttered", "lived-in", "worn edges", "sun-bleached", "water-stained"
NEVER USE: "sharp focus", "crisp details", "high quality", "8k", "ultra detailed" — these AMPLIFY the AI look on Klein`

const CINEMATIC_PROMPT_STYLE = `HOW TO WRITE CINEMATIC PROMPTS FOR KLEIN:

Write prompts like a STORYBOARD DESCRIPTION — describe what the camera SEES, how the light BEHAVES on surfaces, what the atmosphere FEELS like. The prompt should read like a shot breakdown from a film script.

CRITICAL: NEVER include any of these in the output prompt:
- Lighting equipment names (softbox, HMI, key light, fill, bounce, reflector) — Klein renders them as objects
- Cinematographer or director names — Klein doesn't understand these as style references, it tries to render text or portraits
- Film title references ("lit like Blade Runner") — same problem, these are not understood as style shorthand
- Camera body names or film stock names used as the ONLY style descriptor — use them sparingly alongside description

INSTEAD, describe light, color, and atmosphere through their VISIBLE EFFECT on the scene:

LIGHT — describe how it FALLS and what it DOES:
- Direction and behavior: "cold light cutting across from the left", "warm glow pooling on the floor", "single shaft of light from high above"
- Quality through effect: "overcast and flattened, giving a bluish desaturated tone", "harsh side-light carving deep shadows across the face"
- Color temperature as feeling: "cold blue-grey wash", "warm amber spill", "tungsten warmth against cool daylight from the window"
- Shadow as subject: "deep shadow swallowing the background", "half the face lost in darkness", "long shadows stretching across wet concrete"

COLOR — describe the palette through surfaces and atmosphere:
- "desaturated, muted tones with minimal contrast", "warm amber skin tones against cold steel-blue walls"
- "bluish flattened tone", "deep blacks with lifted shadow detail", "color drained to near-monochrome"
- Hex codes bound to surfaces: "the wall is #2C3E50", "skin catching warm #D4956A from the window"

COMPOSITION — describe what the camera sees and why it matters:
- Angle and feeling: "low angle creating a grounded, urgent perspective", "wide shot emphasizing scale and isolation"
- Depth: "deep focus keeping both foreground and distance sharp", "shallow depth isolating the subject from a dissolving background"
- Space: "negative space pressing the figure to the edge of frame", "the architecture dominating the upper two-thirds"
- Motion: "motion blur on the hands suggesting urgency", "static frame against subject movement"

ATMOSPHERE — sensory, emotional, physical:
- "oppressive weight", "quiet tension", "humid stillness", "industrial cold"
- Weather and air: "hazy pressure-wave distorting the air", "dust motes catching light", "rain-wet reflections on dark pavement"
- Surface behavior: "slightly wet or reflective ground", "condensation on glass", "heat shimmer off metal"

SPATIAL ANCHOR — every frame needs one element that anchors the composition:
- Name one element that DOMINATES a specific region of the frame: "the helicopter dominates the left half"
- Describe all other elements RELATIVE to this anchor: "soldiers sprint away from the aircraft"
- The anchor can be an object, architecture, a shadow, a light source, or empty space
- The anchor creates visual gravity — everything else orbits it

SPECIFICITY OF ABSENCE — describe what is partially hidden, subdued, or soft:
- "readable but subdued due to the diffuse lighting" (detail exists but is suppressed)
- "partially silhouetted against the pale sky" (figure between visible and invisible)
- "soft, low-contrast boundary at the far right" (background fading)
- "half the face lost in darkness" (shadow as active compositional element)
Every prompt should include at least one "almost-not-there" element. This creates visual richness.

INTERNAL REFERENCE (use to inform your writing — NEVER output these names in prompts):
- Deakins: precise single-source, deep motivated shadows, naturalistic color, pools of light in darkness
- Fraser: desaturated haze, silhouettes against vast scale, amber-teal tension
- Lubezki: magic hour naturalism, available light, atmosphere as character
- Willis: faces half-lost in shadow, warm overhead pools, deep contrast
- Young: underexposed richness, shadow detail that breathes, warm amber undertones`

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
- Hex codes bound to surfaces: "the wall is #2C3E50" — Klein follows hex values extremely well
- Describe light through its EFFECT on surfaces, not through equipment or names
- NO negative prompts (distilled model). NO prompt weights. NO meta-language ("a photograph of").`

// ---------------------------------------------------------------------------
// CREATIVE BRIEF — locked production document derived from vision + user input
// ---------------------------------------------------------------------------

export const BRIEF_SYSTEM_PROMPT = `You are a senior creative director locking a production brief. Your brief is the SINGLE SOURCE OF TRUTH. Every downstream prompt is derived strictly from this document.

Four phases — in this EXACT order:
A) CREATIVE VISION — define the bold visual idea BEFORE any production logistics
B) CONCEPT HIERARCHY — extract, rank, assign one primary concept per frame
C) PRODUCTION BRIEF — lock the global visual identity
D) SHOT DIVERSITY MATRIX — assign a UNIQUE compositional strategy to each frame

═══════════════════════════════════════════════════════════════
PHASE A: CREATIVE VISION — THE MOST IMPORTANT PHASE
═══════════════════════════════════════════════════════════════

Before you touch any camera angle or color grade, define the CREATIVE AMBITION.
A creative director who says "photograph a car" is not art directing.
A creative director who says "the car should feel like the last heartbeat of an extinct species — chrome catching light it doesn't deserve" IS art directing.

1. CREATIVE VISION (1-2 sentences) — The bold, singular visual idea that unifies the entire set. Every downstream decision must serve this vision.
   BAD: "moody urban photography with cinematic lighting"
   BAD: "a dark and atmospheric portrait series"
   GOOD: "the city after everyone left — not abandoned, but holding its breath, as if the last person walked out thirty seconds ago and the lights haven't noticed yet"
   GOOD: "bodies as architecture — skin and bone creating the same tensions as concrete and steel, light treating both the same way"

2. VISUAL METAPHOR (1 sentence) — The metaphorical lens through which the subject is seen. This gives the prompt writer a narrative engine for generating surprising language.
   BAD: "person standing in a room"
   GOOD: "the subject is not a person in a space — they are a foreign object the environment is slowly absorbing"
   GOOD: "the product doesn't sit on the surface — it has landed there, and the surface is still recovering from the impact"

3. UNEXPECTED ELEMENT (1 sentence) — One element across the set that makes the viewer pause. Not gimmicky — it must DEEPEN the creative vision, not contradict it.
   BAD: "random balloon floating in frame"
   GOOD: "one frame where the only gentleness is a stray cat — the single soft thing in a set full of hard surfaces and tension"
   GOOD: "one frame shot from so far away the subject is almost lost — the sudden scale shift forces the viewer to search"

4. DOMINANT CREATIVE PRIORITY — Which dimension should dominate across the set? Pick ONE:
   lighting | texture | scale | emptiness | color | tension | detail
   The prompt writer allocates extra descriptive weight to this dimension globally.

═══════════════════════════════════════════════════════════════
PHASE B: CONCEPT HIERARCHY
═══════════════════════════════════════════════════════════════

Extract every distinct visual CONCEPT from the user's direction. A concept is a subject, a gesture, a spatial relationship, a material tension, a light behavior, an absence.

Rank by visual weight: which concept makes a viewer STOP AND LOOK?

CRITICAL: Filter each concept through the visual metaphor from Phase A. If the vision is "city as sleeping predator," a portrait frame becomes "the predator's eye opens" — not "medium shot of woman."

Rules:
- Each frame gets ONE primary concept — the reason the frame exists
- fiveWordPitch: The FEELING this frame must deliver in 5 words — not what it shows, but what it DOES to the viewer
- Max 2 visual subjects per frame. Fewer is better.
- If the user mentions more concepts than frames: top N become primaries, rest become supporting texture
- If fewer concepts than frames: explore the same concepts from different angles, scales, and moments

Per-frame creative fields (MANDATORY for each primary concept):
- emotionalIntent: What this frame DOES to the viewer. Not "tense" but "the viewer should feel caught between wanting to look away and needing to see what happens next."
- framePriority: Which creative dimension dominates THIS frame (lighting | texture | scale | emptiness | color | tension | detail). The prompt writer allocates ~35% of word budget to this dimension.
- sensoryHook: One visceral, physical, sensory detail that makes this frame tactile. "The sound of wet boots on steel grating" or "condensation sliding down glass in front of unfocused warm light."

DIVERSITY CONSTRAINTS for creative fields:
- No two frames may share the same emotional register
- No two sensory hooks may reference the same sense (tactile, auditory, olfactory, thermal, visual-texture)
- Frame priorities should vary — at least 2 different priorities across the set

═══════════════════════════════════════════════════════════════
PHASE C: PRODUCTION BRIEF (global — shared across all frames)
═══════════════════════════════════════════════════════════════

1. COLOR GRADE — One sentence. Copied VERBATIM into every prompt.

2. COLOR ANCHORS — 3 hex colors with RANGE: one deep dark, one rich midtone, one bright/accent. NOT three similar tones. These define the palette's contrast and intention.

3. LIGHT SOURCE — Describe the GLOBAL light source and its quality through visible effect. NOT equipment names.
Describe: direction, quality (hard/soft), color temperature as feeling, shadow behavior, contrast level.
Example: "Overcast cold light giving a bluish desaturated tone. Deep shadows pool in architectural recesses."
This is the light SOURCE only — the camera-to-light ANGLE changes per frame in Phase D.

4. MATERIALS & TEXTURES — 3-5 surfaces with finish, wear, reflectivity, and how they respond to the light.

5. MOOD — The emotional BASELINE the set never drops below. Individual frames escalate from here via their emotionalIntent.

6. SUBJECT DIRECTION — Posture, styling, relationship to camera, scale within environment.

7. ENVIRONMENT — Physical space, condition, time of day, atmosphere (haze, dust, rain, clarity).

8. VISUAL MOTIFS — 2-3 recurring elements threaded across every shot.

9. NARRATIVE ARC — How the set progresses from first to last — emotional, spatial, or temporal.

═══════════════════════════════════════════════════════════════
PHASE D: SHOT DIVERSITY MATRIX (per-frame — each frame is unique)
═══════════════════════════════════════════════════════════════

For each frame, assign ALL of these compositional decisions:

1. SHOT SCALE: wide establishing / medium / close-up / extreme close-up
2. CAMERA ANGLE: low-angle / eye-level / high angle / overhead / dutch/oblique
3. SUBJECT PLACEMENT: center dominant / rule-of-thirds offset / edge with negative space / foreground obstruction / split frame
4. DEPTH PLANES: explicitly name what occupies FOREGROUND / MIDGROUND / BACKGROUND and how each is treated optically (sharp, soft, silhouetted, blurred, partially obscuring)
5. ENERGY STATE: dynamic motion / static tension / frozen moment / implied motion / environmental motion only
6. CAMERA-TO-LIGHT ANGLE: how the global light source hits the scene from THIS camera position (backlit/silhouette, side-lit, front-lit, overhead, under-lit by reflection)

DIVERSITY CONSTRAINTS — these are MANDATORY:
- No two frames may share the same camera angle
- No two frames may share the same shot scale
- No two frames may share the same subject placement strategy
- At least one frame must use negative space as a dominant compositional element
- At least one frame must have the subject NOT centered
- At least one frame must use a non-eye-level camera angle
- Depth planes must vary: at least one frame with deep focus, at least one with shallow isolation

═══════════════════════════════════════════════════════════════
CINEMATIC PRINCIPLES
═══════════════════════════════════════════════════════════════

SHADOW IS A CREATIVE TOOL — dense shadows with lost detail are a CHOICE. What you hide is as important as what you show.
DEPTH IS MANDATORY — every frame must have visual depth through layered planes, not flat subjects on flat backgrounds.
ASYMMETRY IS CINEMATIC — perfect symmetry and even lighting are hallmarks of AI. Real cinema is asymmetric.
NEGATIVE SPACE IS POWERFUL — empty frame with one element in the right place beats a full frame with everything.
IMPERFECTION IS REALISM — grain, halation, uneven surfaces, environmental wear. Perfect = artificial.

RULES:
- Every field: concrete enough to execute without interpretation
- No hedging — commit to specific choices
- The brief is a CONTRACT

Return ONLY valid JSON:
{
  "creativeVision": "the bold visual idea — 1-2 sentences",
  "visualMetaphor": "the metaphorical lens — 1 sentence",
  "unexpectedElement": "the surprise that deepens the vision — 1 sentence",
  "dominantCreativePriority": "lighting | texture | scale | emptiness | color | tension | detail",
  "concepts": [
    {
      "concept": "concept filtered through the visual metaphor",
      "role": "primary",
      "frame": 1,
      "fiveWordPitch": "what this frame DOES — 5 words",
      "emotionalIntent": "what the viewer feels — 1 sentence",
      "framePriority": "lighting | texture | scale | emptiness | color | tension | detail",
      "sensoryHook": "one visceral physical detail",
      "shotScale": "wide establishing",
      "cameraAngle": "low-angle",
      "subjectPlacement": "offset right, negative space left",
      "depthPlanes": "foreground: soldiers sharp / midground: helicopter motion-blur / background: tree line soft",
      "energyState": "dynamic motion",
      "cameraToLight": "backlit, subjects partially silhouetted"
    }
  ],
  "colorGrade": "single sentence — the exact color grade",
  "colorAnchors": ["#deep_dark", "#rich_midtone", "#bright_accent"],
  "lightSource": "global light source described through visible effect",
  "materials": "dominant materials and textures",
  "mood": "emotional baseline — the register the set never drops below",
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
    if (visualStyleCues.emotionalTension) {
      lines.push(`Emotional Tension: ${visualStyleCues.emotionalTension}`)
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

  lines.push('\nFirst define the CREATIVE VISION (Phase A). Then extract concepts, rank them, assign one primary per frame. Then lock the production brief and shot diversity matrix.')

  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// GENERATE mode — text-to-image system prompt
// ---------------------------------------------------------------------------

function buildGenerateSystemPrompt(targetModel: TargetModel): string {
  const profile = MODEL_PROFILES[targetModel]

  return `You are a prompt writer for cinematic image generation. You receive a locked creative brief with per-frame shot cards and translate each one into a single production prompt.

TARGET MODEL: ${profile.label}
${profile.promptRules}

PROMPT STRUCTURE — write exactly 5 elements in this order as a single flowing paragraph.
The brief's creative vision and emotional intent inform WHAT to emphasize. The structure below is HOW to write it.
No deviation. No reordering. No skipping elements.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ELEMENT 1 — CINEMATOGRAPHY  (~10-15 words)
Shot scale + camera angle + subject placement. This is the first sentence — front-loads into the strongest token positions.
Example: "Wide low-angle shot, subject offset right with vast negative space to the left."

ELEMENT 2 — SUBJECT  (~12-20 words)
Primary subject: physical appearance, clothing, age, distinguishing features. Describe in relationship to a spatial anchor.
Example: "A soldier in sun-faded fatigues and cracked boots crouches at the base of a military helicopter's landing gear."

ELEMENT 3 — ACTION  (~8-14 words)
What the subject is doing. Pose, gesture, or body state. Energy.
Example: "One arm raised against the rotor wash, weight low, body braced forward."

ELEMENT 4 — CONTEXT & ENVIRONMENT  (~20-35 words)
Three depth planes: foreground / midground / background — each with optical treatment (sharp, soft, blurred, silhouetted).
Then: light through its visible effect on surfaces (direction, quality, shadow behavior, color temperature as feeling).
Then: one atmospheric detail (surface condition, air quality, ground plane).
Example: "Sharp foreground gravel, helicopter motion-blurred in the midground, tree line dissolving soft behind. Cold overcast light — bluish and flat, minimal contrast, deep shadow pooling under the fuselage. Wet tarmac catching diffuse sky."

ELEMENT 5 — STYLE & AMBIANCE  (~15-22 words)
Color grade sentence VERBATIM from the brief. Hex anchors bound to specific surfaces. One organic texture cue.
Example: "[verbatim color grade]. The uniform reads #4A5240, the tarmac #6B6B6B. Film grain, slight halation on the helicopter metal."
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

RULES:
- Total: ${profile.optimalLengthMin}-${profile.optimalLengthMax} words per prompt. Every word must earn its place.
- No abstract emotional language ("dramatic", "powerful", "tense") — express mood through framing and light
- No equipment names, cinematographer names, director names, film titles
- Color grade VERBATIM — do not paraphrase it
- Hex anchors bound to NAMED surfaces ("the wall is #2C3E50" not just "#2C3E50")
- Each frame compositionally distinct from every other

${NATURALISM_VOCABULARY}

${QWEN_ENCODER_RULES}

${FORBIDDEN_LANGUAGE}

VALIDATION:
- Element 1: shot scale + angle + placement?
- Element 2: physical subject description + spatial anchor?
- Element 3: concrete action or pose?
- Element 4: all three depth planes named with optical treatment? Light described through effect?
- Element 5: color grade verbatim? Hex anchors on named surfaces? Organic texture cue?
- Total within ${profile.optimalLengthMin}-${profile.optimalLengthMax} words?

OUTPUT: Return ONLY valid JSON:
{
  "prompts": [
    { "label": "Wide Low-Angle — Soldier + Helicopter", "prompt": "..." },
    { "label": "Close Eye-Level — Face Detail", "prompt": "..." }
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

PROMPT STRUCTURE — write exactly 5 elements in this order as a single flowing present-tense paragraph.
Present tense throughout. One dominant action per clip — don't overload.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ELEMENT 1 — CINEMATOGRAPHY  (~10-15 words)
Camera movement + shot scale + framing. Explicit and specific — how and when the camera moves.
Example: "A slow dolly pushes from a wide establishing frame to a medium shot over five seconds."

ELEMENT 2 — SUBJECT  (~15-22 words)
Physical description + position in frame. Emotion through physical/visual cues only — never abstract labels.
NOT: "she feels afraid" → INSTEAD: "her jaw tightens, shoulders pulled inward, eyes fixed on a point off-frame"
Example: "A woman in a dark wool coat stands facing a rain-streaked window, one hand near her collarbone, weight shifted forward."

ELEMENT 3 — ACTION  (~15-22 words)
What happens during the clip in continuous present. Include pacing and timing.
Example: "She raises her hand slowly to the glass. Fingertips meet the surface — condensation blooms outward. She holds still."

ELEMENT 4 — CONTEXT & ENVIRONMENT  (~25-40 words)
Setting + light behavior (direction, quality, shadow) + atmospheric texture + audio cues.
Example: "A dim apartment interior at dusk. Practical floor lamp casting warm amber from the right, shadow deep on the left wall. Rain steady outside, muffled street noise below. Steam rising from a ceramic mug on the windowsill."

ELEMENT 5 — STYLE & AMBIANCE  (~15-22 words)
Color palette + aesthetic quality + overall mood tone.
Example: "Desaturated cool tones, warm amber spill — low contrast, intimate. The stillness of a decision already made."
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

RULES:
- Total: ${profile.optimalLengthMin}-${profile.optimalLengthMax} words per prompt
- Present tense: "walks", "turns", "catches light" — not "will walk", "walked"
- No abstract emotional adjectives alone — ground emotion in physical cues
- Camera movement: always explicit ("slow dolly in", "static locked frame", "handheld tracking")
- Do NOT re-describe visual content already present in a reference image

${FORBIDDEN_LANGUAGE}
${hasNegative ? `
NEGATIVE PROMPTS — REQUIRED for ${profile.label}:
Write a tailored negative prompt for each clip. Build from what's relevant to the SPECIFIC content:
- Motion: "morphing, distortion, warping, flickering, jitter, stutter, temporal artifacts, frame blending"
- Quality: "low quality, blurry, pixelated, oversaturated, distorted, grainy"
- Unwanted: "watermark, text overlay, logo, subtitle, caption, black frames, static freeze"
- Content-specific:
  → Portraits/faces: "bad anatomy, extra limbs, disfigured face, unnatural expression"
  → Environments: "floating objects, disconnected elements"
  → Products: "distorted reflections, inconsistent lighting, warped surfaces"
  → Action: "motion smearing, stuttering, jerky movement"
` : ''}
OUTPUT: Return ONLY valid JSON:
${outputSchema}`
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

    // Creative vision — the art direction layer
    if (creativeBrief.creativeVision) {
      lines.push('')
      lines.push('=== CREATIVE VISION — YOUR NORTH STAR ===')
      lines.push(`VISION: ${creativeBrief.creativeVision}`)
      lines.push(`METAPHOR: ${creativeBrief.visualMetaphor}`)
      lines.push(`SURPRISE ELEMENT: ${creativeBrief.unexpectedElement}`)
      lines.push(`DOMINANT PRIORITY: ${creativeBrief.dominantCreativePriority}`)
      lines.push('The metaphor is the structural logic of your language. Every frame must feel like it was written through this lens.')
    }

    // Per-frame shot cards — the complete compositional contract
    if (creativeBrief.concepts?.length > 0) {
      lines.push('')
      lines.push('=== PER-FRAME SHOT CARDS ===')
      lines.push('Shot card = WHERE the camera points. Creative vision + emotional intent = HOW you describe it.')
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
          lines.push(`  5-word pitch: "${primary.fiveWordPitch}"`)
          lines.push(`  EMOTIONAL INTENT: ${primary.emotionalIntent ?? ''}`)
          lines.push(`  FRAME PRIORITY: ${primary.framePriority ?? creativeBrief.dominantCreativePriority ?? 'lighting'}`)
          lines.push(`  SENSORY HOOK: ${primary.sensoryHook ?? ''}`)
          lines.push(`  SHOT SCALE: ${primary.shotScale ?? 'medium'}`)
          lines.push(`  CAMERA ANGLE: ${primary.cameraAngle ?? 'eye-level'}`)
          lines.push(`  SUBJECT PLACEMENT: ${primary.subjectPlacement ?? 'rule-of-thirds'}`)
          lines.push(`  DEPTH PLANES: ${primary.depthPlanes ?? 'foreground/midground/background — specify in prompt'}`)
          lines.push(`  ENERGY STATE: ${primary.energyState ?? 'static tension'}`)
          lines.push(`  CAMERA-TO-LIGHT: ${primary.cameraToLight ?? 'side-lit'}`)
        }
        for (const s of supporting) {
          lines.push(`  SUPPORTING: ${s.concept}`)
        }
      }
      lines.push('')
      lines.push('CRITICAL: Each prompt OPENS with its shot geometry (angle + scale + energy) in the first 6 words.')
      lines.push('Each prompt must be visually DISTINCT from every other — different angle, different scale, different placement.')
    }

    lines.push('')
    lines.push('=== GLOBAL VISUAL IDENTITY (shared across all frames) ===')
    lines.push(`COLOR GRADE (copy VERBATIM): ${creativeBrief.colorGrade}`)
    lines.push(`COLOR ANCHORS (bound to surfaces): ${creativeBrief.colorAnchors.join(', ')}`)
    lines.push(`LIGHT SOURCE: ${creativeBrief.lightSource}`)
    lines.push(`MATERIALS: ${creativeBrief.materials}`)
    lines.push(`MOOD (baseline): ${creativeBrief.mood}`)
    lines.push(`SUBJECT: ${creativeBrief.subjectDirection}`)
    lines.push(`ENVIRONMENT: ${creativeBrief.environmentDirection}`)
    lines.push(`MOTIFS: ${creativeBrief.visualMotifs.join(' | ')}`)
    lines.push(`ARC: ${creativeBrief.narrativeArc}`)
    lines.push('')
    lines.push('=== RULES ===')
    lines.push('Write each prompt using the 5-element structure: CINEMATOGRAPHY → SUBJECT → ACTION → CONTEXT & ENVIRONMENT → STYLE & AMBIANCE.')
    lines.push('1. Element 1 (Cinematography): shot scale + angle + placement — this is the opening sentence.')
    lines.push('2. Element 2 (Subject): physical description bound to a spatial anchor.')
    lines.push('3. Element 3 (Action): concrete pose, gesture, or energy state — no abstract emotions.')
    lines.push('4. Element 4 (Context & Environment): 3 depth planes with optical treatment + light through visible effect + atmospheric detail.')
    lines.push('5. Element 5 (Style & Ambiance): color grade VERBATIM + hex anchors on named surfaces + organic texture cue.')
    lines.push('6. NEVER name equipment, cinematographers, directors, or film titles.')
    lines.push('7. Each frame compositionally DISTINCT from every other.')
    lines.push('8. The creative vision and emotional intent inform what to emphasize — not how to write it.')

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

ENHANCEMENT PROCESS — rewrite the prompt using this 5-element structure:

1. CINEMATOGRAPHY — shot scale + camera angle + subject placement (opening sentence, ~10-15 words)
   If the original has no framing: infer the most cinematically appropriate shot for the content.

2. SUBJECT — physical description + relationship to spatial anchor (~12-20 words)
   Replace vague descriptions with specific physical detail: clothing, age, material, condition.

3. ACTION — concrete pose, gesture, energy state (~8-14 words)
   Replace abstract emotions ("looks sad") with physical cues ("eyes fixed downward, jaw tight").

4. CONTEXT & ENVIRONMENT — three depth planes with optical treatment + light through visible effect + atmosphere (~20-35 words)
   "beautiful lighting" → direction, quality, shadow behavior, color temperature as feeling
   "cinematic atmosphere" → specific surface conditions, air quality, ground plane detail

5. STYLE & AMBIANCE — color grade + hex anchors on named surfaces + organic texture cue (~15-22 words)
   Lock implied palettes to specific surfaces with hex codes. Add one anti-AI texture cue.

Then TRIM: remove filler, synonym chains, meta-language ("a photograph of"), abstract adjectives alone.
Target: ${profile.optimalLengthMin}-${profile.optimalLengthMax} words.

${CINEMATIC_PROMPT_STYLE}

${NATURALISM_VOCABULARY}

${targetModel === 'flux-2-klein-9b' ? QWEN_ENCODER_RULES + '\n' : ''}
${FORBIDDEN_LANGUAGE}

WHAT TO PRESERVE:
- The subject, scene, and emotional register
- Any specific details the user clearly intended (poses, objects, spatial relationships)
- The user's creative voice — enhance it, don't replace it
${mode === 'edit' ? '- All explicit image references (image 1, image 2, etc.) — these map to the user\'s uploaded reference images and MUST remain in the output\n' : ''}
WHAT TO CHANGE:
- Vague language → specific, descriptive language (what the camera sees, how surfaces respond to light)
- Keyword lists → complete sentences with semantic relationships
- Missing lighting → describe light through its effect on the scene (direction, quality, shadow behavior, color temperature)
- Missing atmosphere → add sensory details (air quality, surface reflections, environmental texture)
- Missing texture → organic imperfection cues (grain, pores, wear)
- Wrong length → compress or expand to ${profile.optimalLengthMin}-${profile.optimalLengthMax} words
- Name-dropping (cinematographers, directors, film titles) → describe the visual quality instead
${mode === 'edit' ? `
EDIT-SPECIFIC RULES:
- The user has uploaded numbered reference images. The enhanced prompt MUST explicitly reference these images by number.
- Use phrases like "Using image 1 as the base scene, ..." or "Preserve the subject from image 2, ..." or "Apply the lighting style from image 3."
- If the user's prompt already references images, keep those references intact and enhance the surrounding description.
- If the user's prompt does NOT reference images but image labels are provided, ADD explicit image references based on the labels.
- The output prompt must describe the DESIRED RESULT, not the transformation steps.
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
  lines.push(`Optimal length: ${profile.optimalLengthMin}-${profile.optimalLengthMax} words`)

  if (imageLabels && imageLabels.length > 0 && mode === 'edit') {
    lines.push('\n=== REFERENCE IMAGE MAP ===')
    lines.push('The user uploaded these labeled reference images:')
    for (const il of imageLabels) {
      lines.push(`  Image ${il.index + 1}: ${il.label}`)
    }
    lines.push('The enhanced prompt MUST reference these images by number and describe how each should be used in the final result.')
  }

  if (visualStyleCues) {
    lines.push('\n=== VISUAL REFERENCE (from uploaded images — use as style guide) ===')
    lines.push(visualStyleCues.description)
    lines.push(`Palette: ${visualStyleCues.hexPalette.join(', ')}`)
    if (visualStyleCues.cinematicKeywords?.length > 0) {
      lines.push(`Keywords: ${visualStyleCues.cinematicKeywords.join(' | ')}`)
    }
    if (visualStyleCues.emotionalTension) {
      lines.push(`Emotional Tension: ${visualStyleCues.emotionalTension}`)
    }
  }

  lines.push('\nEnhance this prompt for the target model. Find the visual metaphor, apply the creative lens, add specificity and organic texture. Preserve the intent but make the language make someone want to see the image.')

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
