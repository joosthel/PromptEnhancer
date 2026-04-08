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
VAGUE ADJECTIVES (for photographic output): "ethereal", "dreamlike", "magical", "otherworldly", "surreal", "breathtaking",
"whimsical", "fantastical", "enchanted", "mystical", "stunning", "captivating", "mesmerizing",
"awe-inspiring", "hauntingly beautiful", "masterpiece", "best quality", "8k", "ultra HD", "hyperrealistic"
MEDIUM EXCEPTION: When the brief specifies an illustration medium, "ethereal", "dreamlike", and "whimsical" ARE allowed — they're natural for artistic work. All other forbidden words remain banned.
LIGHTING EQUIPMENT (Klein renders these as visible objects): "softbox", "HMI", "key light", "fill light",
"bounce light", "reflector", "diffusion panel", "beauty dish", "ring light", "strobe", "flash",
"light array", "overhead light", "backlight panel" — describe light through its visible EFFECT instead
NAME-DROPPING: Do NOT name cinematographers, directors, artists, or film titles in the prompt — Klein cannot interpret
these as style references. Instead, DESCRIBE the visual quality you want.
SHARPNESS AMPLIFIERS: "sharp focus", "crisp details", "high quality", "ultra detailed" — amplify AI look`

const NATURALISM_VOCABULARY = `NATURALISM VOCABULARY — counteract Klein's synthetic smoothness with REAL-WORLD texture cues.
Include at least 1-2 texture cues appropriate to the scene's aesthetic:

FOR WORN/ORGANIC SCENES:
- Surface: "scuffed", "patina'd", "rain-spotted", "dust-settled", "cracked", "peeling", "sun-faded"
- Film: "film grain", "subtle halation on highlights", "analog color shift", "gentle vignetting"

FOR CLEAN/PRISTINE SCENES:
- Surface: "crisp fabric weave", "smooth polished concrete", "brushed metal", "fresh paint", "clean glass"
- Skin: "natural skin texture", "subtle peach fuzz", "healthy sheen", "smooth complexion"
- Film: "clean digital clarity", "precise color rendering", "minimal grain"

FOR ANY SCENE:
- "slight lens imperfection", "natural depth of field falloff", "micro-texture on surfaces"

SKIN (match to subject age and context):
- Youth: "smooth skin", "natural peach fuzz", "healthy flush", "clear complexion"
- Adult: "natural skin texture with visible pores", "subtle expression lines"
- Aged: "fine lines around eyes", "uneven skin tone", "weathered texture"

MATCH the texture vocabulary to the user's intent. A bright children's portrait needs "healthy glow" not "uneven skin tone". A gritty noir needs "visible pores and fine lines" not "smooth skin".
NEVER USE: "sharp focus", "crisp details", "high quality", "8k", "ultra detailed" — these AMPLIFY the AI look on Klein`

const ILLUSTRATION_VOCABULARY = `ILLUSTRATION VOCABULARY — match texture language to the detected artistic medium.

WATERCOLOR:
- Technique: "transparent washes", "wet-on-wet blooms", "dry brush texture", "lifting to reveal white paper", "glazed layers"
- Surface: "cold-pressed paper texture", "granulating pigment settling in tooth", "soft bleeding edges", "hard edges where wash dried"
- Light: "light rendered as absence of paint", "warm wash gradients", "sharp white paper highlights left unpainted"

OIL / ACRYLIC:
- Technique: "visible impasto", "palette knife marks", "layered glazes", "thick paint ridges catching light", "scumbled texture"
- Surface: "canvas weave visible through thin passages", "built-up texture in highlights", "smooth blended transitions in skin"

INK / LINE:
- Technique: "varied line weight", "crosshatching density for tone", "ink wash gradients", "splatter texture", "controlled bleed at edges"
- Surface: "crisp linework against soft wash", "white paper as active negative space"

DIGITAL PAINTING:
- Technique: "visible brush tool texture", "layered opacity", "soft airbrush gradients", "textured brush marks"

FOR ANY ILLUSTRATION:
- "hand-painted quality", "deliberate mark-making", "artistic imperfection in strokes",
  "visible artist's hand", "organic irregularity", "medium-specific surface texture"

MATCH the vocabulary to the specific medium described in the brief. A loose watercolor needs "blooms and bleeding edges" not "impasto ridges".
NEVER USE photographic texture language ("film grain", "lens imperfection", "depth of field falloff") for illustration output.`

const CINEMATIC_PROMPT_STYLE = `HOW TO WRITE CINEMATIC PROMPTS FOR KLEIN:

Write prompts like a STORYBOARD DESCRIPTION — describe what the camera SEES, how the light BEHAVES on surfaces, what the atmosphere FEELS like. The prompt should read like a shot breakdown from a film script.

CRITICAL: NEVER include any of these in the output prompt:
- Lighting equipment names (softbox, HMI, key light, fill, bounce, reflector) — Klein renders them as objects
- Cinematographer or director names — Klein doesn't understand these as style references, it tries to render text or portraits
- Film title references ("lit like Blade Runner") — same problem, these are not understood as style shorthand
- Camera body names or film stock names used as the ONLY style descriptor — use them sparingly alongside description

INSTEAD, describe light, color, and atmosphere through their VISIBLE EFFECT on the scene:

LIGHT — describe how it FALLS and what it DOES:
- Direction: "cold light cutting across from the left", "warm glow pooling on the floor", "even daylight filling the space", "single shaft of light from high above"
- Quality: "overcast and flattened", "harsh side-light carving shadows", "bright diffused light opening all detail", "high-key even illumination", "soft wrap-around light"
- Temperature: "cold blue-grey wash", "warm amber spill", "clean neutral daylight", "tungsten warmth against cool daylight from the window"
- Shadow range: from "deep shadow swallowing the background" to "open shadows with full detail visible" — match to the scene's mood

COLOR — describe the palette through surfaces and atmosphere. Match to the creative direction:
- Dark/moody: "desaturated, muted tones with minimal contrast", "deep blacks with lifted shadow detail", "color drained to near-monochrome"
- Bright/clean: "saturated primaries with open highlights", "warm skin tones against vivid environment color", "bright whites and clean color separation"
- Neutral: "naturalistic color with accurate white balance", "subtle grade preserving original palette"
- Color on surfaces: prefer natural description ("deep slate blue wall", "skin catching warm amber from the window"). Use hex only for precise color matching when critical.

COMPOSITION — describe what the camera sees and why it matters:
- Angle and feeling: "low angle creating a grounded, urgent perspective", "wide shot emphasizing scale and isolation"
- Depth: "deep focus keeping both foreground and distance sharp", "shallow depth isolating the subject from a dissolving background"
- Space: "negative space pressing the figure to the edge of frame", "the architecture dominating the upper two-thirds"
- Motion: "motion blur on the hands suggesting urgency", "static frame against subject movement"

ATMOSPHERE — match to the scene's emotional register:
- Heavy: "oppressive weight", "quiet tension", "humid stillness", "industrial cold"
- Light: "open air", "gentle warmth", "playful energy", "spacious calm", "crisp clarity"
- Sensory: "dust motes catching light", "condensation on glass", "heat shimmer off metal", "dew on grass", "rain-wet reflections"
- Surface behavior: "slightly wet or reflective ground", "dry sun-warmed concrete", "polished surfaces catching color"

SPATIAL ANCHOR — every frame needs one element that anchors the composition:
- Name one element that DOMINATES a specific region of the frame: "the helicopter dominates the left half"
- Describe all other elements RELATIVE to this anchor: "soldiers sprint away from the aircraft"
- The anchor can be an object, architecture, a shadow, a light source, or empty space
- The anchor creates visual gravity — everything else orbits it

SPECIFICITY OF ABSENCE — when the mood calls for it, describe what is partially hidden or subdued:
- "readable but subdued due to the diffuse lighting"
- "partially silhouetted against the pale sky"
- "soft, low-contrast boundary at the far right"
Use when the creative direction calls for mystery, tension, or shadow. Do NOT force absence into bright, open compositions.

INTERNAL REFERENCE (inform your writing style — NEVER output names in prompts):
Match the reference palette to the user's aesthetic intent:
- DARK: Deakins (single-source, deep shadows), Fraser (desaturated haze), Willis (faces half-lost in shadow)
- BRIGHT: Richardson (saturated color, vivid daylight), Khondji (luminous skin, precise color), Miyagawa (clean high-key)
- NATURAL: Lubezki (magic hour, available light), Young (warm amber undertones)
- CONTROLLED: Storaro (bold color blocking), Savides (muted but precise)`

const ILLUSTRATION_PROMPT_STYLE = `HOW TO WRITE ILLUSTRATION PROMPTS:

Write prompts like an ART DIRECTOR'S BRIEF — describe the scene as it should appear in the specified medium. Focus on composition, artistic technique, and how the medium itself contributes to the mood.

COMPOSITION — describe the visual arrangement and artistic choices:
- Viewpoint: "centered composition with figure dominating the lower third", "off-center subject with empty painted sky"
- Balance: "asymmetric weight pulling left", "scattered elements across the surface", "tight cropping on the face"
- Focal hierarchy: "the figure is the sharpest element, background dissolved into loose washes"

COLOR — describe as artistic choice, not physical light response:
- Application: "saturated washes bleeding into each other", "dry-brushed muted tones", "bold flat color fields"
- Palette: "limited palette of warm earth tones", "high-key pastels with one deep accent"
- Treatment: "colors left to bloom and mix on the surface", "precise controlled layers"

LIGHT — describe how the artist RENDERED light, not physical behavior:
- Technique: "light areas left as unpainted paper", "thick highlights built up in impasto", "soft tonal gradients"
- Mood: "warm light suggested through yellow-orange washes", "cool shadow rendered in blue-grey layers"
- Do NOT use photographic light language (direction, color temperature, shadow depth)

MEDIUM & TECHNIQUE — the artistic material IS part of the prompt:
- Name the medium and its visible behavior: "loose watercolor on rough paper", "thick oil on canvas"
- Describe brushwork: "confident single-stroke marks", "layered transparent glazes", "splattered ink accents"
- Surface: "paper texture visible through thin washes", "canvas weave under scumbled paint"

SPATIAL ANCHOR — same principle as cinematic: one element anchors the composition.

INTERNAL REFERENCE — ILLUSTRATION (inform your style, NEVER output names):
- WATERCOLOR: Sargent (luminous wet-in-wet), Wyeth (dry precise realism), Zorn (economy of stroke)
- OIL: Fechin (bold impasto portraits), Sorolla (light as thick paint), Freud (raw flesh texture)
- INK: Steadman (explosive energy), Moebius (precise linework), Toppi (dramatic contrast)
- DIGITAL: Rockwell (narrative clarity), Mucha (decorative flow), contemporary concept art`

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
3. If a visual analysis palette is provided, colorAnchors must be selected from those hex values.
4. creativeVision must articulate what the references already communicate — not invent a new concept.

You are a senior creative director locking a production brief. Your brief is the SINGLE SOURCE OF TRUTH. Every downstream prompt is derived strictly from this document.

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

0. MEDIUM (include ONLY if the visual analysis detected a non-photographic medium)
   State the artistic medium and technique. This field is advisory — if the user's creative direction
   contradicts it, follow the user. Omit this field entirely for photographic/cinematic output.
   Examples: "loose watercolor on rough cold-pressed paper", "oil painting with visible impasto", "ink wash with precise linework"

1. COLOR GRADE — One sentence. Copied VERBATIM into every prompt.
   For illustration: describe as color TREATMENT ("muted transparent washes with bleeding edges") not photographic grade.

2. COLOR REFERENCE — 3 to 5 color descriptions that define the palette's intention. Use natural language by default ("warm amber", "deep slate blue", "muted olive"). Include a hex code only when a precise color match is critical. A monochrome scene may need only 2-3; a colorful scene should use 4-5.

3. LIGHT SOURCE — For photographs: describe the GLOBAL light source through visible effect. NOT equipment names.
   For illustrations: describe how the artist RENDERED light — technique (wash gradients, unpainted paper as highlight, painted shadow shapes), not physical light direction/quality.
   Example (photo): "Overcast cold light giving a bluish desaturated tone. Deep shadows pool in architectural recesses."
   Example (illustration): "Warm light rendered through yellow-ochre washes, shadows built in layered blue-grey glazes, highlights left as white paper."

4. MATERIALS & TEXTURES — 3-5 surfaces with finish, wear, reflectivity, and how they respond to the light.
   For illustrations: include the artistic medium's texture (paper grain, brushwork, paint opacity) alongside scene materials.

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

DEPTH IS MANDATORY — every frame must have visual depth through layered planes, not flat subjects on flat backgrounds.
ASYMMETRY OFTEN READS AS CINEMATIC — but deliberate symmetry can be powerful when intentional.
TEXTURE IS REALISM — whether that's worn grain or pristine smoothness, surfaces should feel tangible.
SHADOW IS A TOOL — use it when the mood calls for it, not as a default.
NEGATIVE SPACE IS POWERFUL — empty frame with one element in the right place beats a full frame with everything.

RULES:
- Every field: concrete enough to execute without interpretation
- No hedging — commit to specific choices
- The brief is a CONTRACT
- PRESERVE SPECIFICS: If the user mentions specific materials ("scratched metallic details"), specific elements ("black wires hanging from the ceiling"), specific constraints ("no faces visible", "no clear gender"), or specific atmosphere ("fog"), these MUST appear verbatim in the relevant brief fields. Do NOT abstract "black wires" into "dark elements" or "no faces visible" into "obscured features". Carry the user's specific language through.
- If reference images show specific visual elements, name them concretely in the brief — not as abstract qualities

GROUNDING RULE — CREATIVE VISION MUST BE DERIVED, NOT INVENTED:
Your creative vision is an ARTICULATION of what the reference images and user direction already communicate — not a departure from them. If the images show cold industrial interiors, your vision must work WITH that reality, not pivot to something unrelated. The metaphor and unexpected element must DEEPEN what's already there, not contradict or replace it.

COLOR REFERENCE RULE — DERIVED FROM VISUAL ANALYSIS:
If a visual analysis palette is provided, your colorAnchors should reflect the same color family — but express them as natural descriptions ("warm amber", "cool slate") rather than hex codes. Use hex only when a precise match matters. Do NOT invent colors absent from the reference images.

IMAGE LABEL INTEGRATION:
When reference image labels are provided, they define the ROLE each image plays:
- "style reference" → This image's palette, lighting, and texture define the visual vocabulary. Weight its visual qualities heavily in colorGrade, lightSource, materials, and mood.
- "subject" / "face" → This image defines the physical appearance of the subject. Carry specific details (clothing, features, pose) into subjectDirection.
- "background" / "composition" → This image defines the spatial environment. Carry spatial arrangements, depth, and architecture into environmentDirection.
- Unlabeled images → Contribute equally to the overall visual vocabulary.

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
  "medium": "artistic medium and technique (omit field or set null for photographic output)",
  "colorGrade": "single sentence — the exact color grade or color treatment",
  "colorAnchors": ["warm amber", "deep slate blue", "#2C3E50 (only if precise match needed)", "...up to 5"],
  "lightSource": "light source or light rendering technique",
  "materials": "dominant materials and textures",
  "mood": "emotional baseline — the register the set never drops below",
  "subjectDirection": "how subjects are treated",
  "environmentDirection": "the physical space",
  "visualMotifs": ["motif 1", "motif 2", "motif 3"],
  "narrativeArc": "how the set progresses",
  "fullBrief": "complete brief as flowing paragraph (~300 words)"
}

FINAL CHECK before outputting JSON:
1. Does creativeVision articulate what the reference images ALREADY communicate (not invent something new)?
2. Are colorAnchors (3-5) present in or closely matched to the extracted palette?
3. Does every user-specified constraint appear verbatim in the relevant field?
4. Is every field concrete enough to execute without interpretation?
Return ONLY the JSON object. No markdown, no explanation.`

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

  lines.push('\nFirst define the CREATIVE VISION (Phase A). Then extract concepts, rank them, assign one primary per frame. Then lock the production brief and shot diversity matrix.')

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
    ? `You are a prompt writer for AI image generation in an illustration style. You receive a locked creative brief with per-frame shot cards and translate each one into a single production prompt that reproduces the specified artistic medium.

The brief specifies medium: "${medium}". Your prompts must produce output in this medium — not photographic output.`
    : `You are a prompt writer for cinematic image generation. You receive a locked creative brief with per-frame shot cards and translate each one into a single production prompt.`

  const element1 = isIllustration
    ? `ELEMENT 1 — COMPOSITION  (~10-15 words)
Viewpoint, focal hierarchy, and spatial arrangement. This is the first sentence — front-loads into the strongest token positions.
Example: "Centered composition, figure dominating the lower third, soft empty sky filling the upper frame."`
    : `ELEMENT 1 — CINEMATOGRAPHY  (~10-15 words)
Shot scale + camera angle + subject placement. This is the first sentence — front-loads into the strongest token positions.
Example: "Wide low-angle shot, subject offset right with vast negative space to the left."`

  const element4 = isIllustration
    ? `ELEMENT 4 — ENVIRONMENT & TECHNIQUE  (~20-35 words)
Spatial arrangement: foreground / midground / background — each with artistic treatment (detailed, loose, dissolved, suggested).
Then: light as the artist rendered it (wash gradients, unpainted highlights, tonal shifts) — NOT physical light behavior.
Then: one medium-specific atmospheric detail.
Example: "Detailed foreground foliage in precise strokes, figure rendered in midground with confident washes, background dissolved into loose wet-on-wet blooms. Warm light suggested through yellow-ochre gradients, shadows in cool blue-grey layers. Paper texture visible in the sky."`
    : `ELEMENT 4 — CONTEXT & ENVIRONMENT  (~20-35 words)
Three depth planes: foreground / midground / background — each with optical treatment (sharp, soft, blurred, silhouetted).
Then: light through its visible effect on surfaces (direction, quality, shadow behavior, color temperature as feeling).
Then: one atmospheric detail (surface condition, air quality, ground plane).
Example: "Sharp foreground gravel, helicopter motion-blurred in the midground, tree line dissolving soft behind. Cold overcast light — bluish and flat, minimal contrast, deep shadow pooling under the fuselage. Wet tarmac catching diffuse sky."`

  const element5 = isIllustration
    ? `ELEMENT 5 — MEDIUM & FINISH  (~15-22 words)
Color treatment from the brief. Medium technique and surface quality. One artistic texture detail.
Example: "[color treatment]. Transparent watercolor washes with granulating pigment. Cold-pressed paper texture visible through thin passages."`
    : `ELEMENT 5 — STYLE & AMBIANCE  (~15-22 words)
Color grade sentence VERBATIM from the brief. Color references using natural descriptions (hex only when precise match is critical). One organic texture cue.
Example: "[verbatim color grade]. The uniform in muted olive, tarmac in flat grey. Film grain, slight halation on the helicopter metal."`

  const validation = isIllustration
    ? `VALIDATION:
- Element 1: viewpoint + focal hierarchy + spatial arrangement?
- Element 2: physical subject description as depicted in the medium?
- Element 3: concrete action or pose?
- Element 4: spatial depth with artistic treatment? Light as rendered by artist? Medium-specific atmosphere?
- Element 5: color treatment? Medium technique? Artistic texture detail?
- Total up to ${profile.optimalLengthMax} words?`
    : `VALIDATION:
- Element 1: shot scale + angle + placement?
- Element 2: physical subject description + spatial anchor?
- Element 3: concrete action or pose?
- Element 4: all three depth planes named with optical treatment? Light described through effect?
- Element 5: color grade verbatim? Color references on named surfaces? Organic texture cue?
- Total up to ${profile.optimalLengthMax} words?`

  const vocabBlock = isIllustration
    ? (targetModel === 'flux-2-klein-9b' ? ILLUSTRATION_VOCABULARY + '\n\n' + QWEN_ENCODER_RULES : '')
    : (targetModel === 'flux-2-klein-9b' ? NATURALISM_VOCABULARY + '\n\n' + QWEN_ENCODER_RULES : '')

  const styleBlock = isIllustration
    ? (targetModel === 'flux-2-klein-9b' ? ILLUSTRATION_PROMPT_STYLE : '')
    : (targetModel === 'flux-2-klein-9b' ? CINEMATIC_PROMPT_STYLE : '')

  return `${intro}

TARGET MODEL: ${profile.label}
${profile.promptRules}

${styleBlock ? styleBlock + '\n' : ''}PROMPT STRUCTURE — write exactly 5 elements in this order as a single flowing paragraph.
The brief's creative vision and emotional intent inform WHAT to emphasize. The structure below is HOW to write it.
No deviation. No reordering. No skipping elements.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${element1}

ELEMENT 2 — SUBJECT  (~12-20 words)
Primary subject: physical appearance, clothing, age, distinguishing features. Describe in relationship to a spatial anchor.

ELEMENT 3 — ACTION  (~8-14 words)
What the subject is doing. Pose, gesture, or body state. Energy.

${element4}

${element5}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

RULES:
- Up to ${profile.optimalLengthMax} words per prompt. Shorter is better when the shot card is simple. Every word must earn its place.
- No abstract emotional language ("dramatic", "powerful", "tense") — express mood through framing and ${isIllustration ? 'technique' : 'light'}
- No equipment names, ${isIllustration ? 'artist' : 'cinematographer'} names, director names, film titles
- Color ${isIllustration ? 'treatment' : 'grade'} VERBATIM — do not paraphrase it
- Color references on named surfaces using natural descriptions. Use hex only when precise color match is critical.
- Each frame compositionally distinct from every other

${vocabBlock ? vocabBlock + '\n' : ''}${FORBIDDEN_LANGUAGE}

${validation}

OUTPUT: Return ONLY valid JSON:
{
  "prompts": [
    { "label": "${isIllustration ? 'Centered Composition — Figure in Wash' : 'Wide Low-Angle — Soldier + Helicopter'}", "prompt": "..." },
    { "label": "${isIllustration ? 'Close Detail — Hands and Texture' : 'Close Eye-Level — Face Detail'}", "prompt": "..." }
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
- Up to ${profile.optimalLengthMax} words per prompt
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
    lines.push(`COLOR REFERENCE (advisory, not binding): ${creativeBrief.colorAnchors.join(', ')}`)
    lines.push(`LIGHT SOURCE: ${creativeBrief.lightSource}`)
    lines.push(`MATERIALS: ${creativeBrief.materials}`)
    lines.push(`MOOD (baseline): ${creativeBrief.mood}`)
    lines.push(`SUBJECT: ${creativeBrief.subjectDirection}`)
    lines.push(`ENVIRONMENT: ${creativeBrief.environmentDirection}`)
    lines.push(`MOTIFS: ${creativeBrief.visualMotifs.join(' | ')}`)
    lines.push(`ARC: ${creativeBrief.narrativeArc}`)
    // Pass the user's original description as hard constraints
    if (userInputs.description?.trim()) {
      lines.push('')
      lines.push('=== ORIGINAL CREATIVE DIRECTION (hard constraints — every prompt must respect these) ===')
      lines.push(userInputs.description)
      lines.push('Every specific detail, constraint, and requirement stated above MUST be reflected in every prompt. Do not abstract, soften, or omit any of these directives.')
    }

    // Pass vision cues as authoritative for visual fidelity
    if (visualStyleCues) {
      lines.push('')
      lines.push('=== VISUAL GROUND TRUTH (from reference images — AUTHORITATIVE for color, texture, atmosphere) ===')
      lines.push('When writing color grades, light descriptions, and surface textures, match THIS description — not the brief\'s abstractions.')
      lines.push(visualStyleCues.description)
      lines.push(`Reference Palette: ${visualStyleCues.hexPalette.join(', ')}`)
      lines.push('These colors represent the reference images. Use as guidance — natural color descriptions are preferred over hex codes in prompts.')
      if (visualStyleCues.visualKeywords?.length > 0) {
        lines.push(`Visual qualities (integrate into prompts): ${visualStyleCues.visualKeywords.join(' | ')}`)
      }
      if (visualStyleCues.atmosphere) {
        lines.push(`Atmosphere: ${visualStyleCues.atmosphere}`)
      }
    }

    const isIllustration = creativeBrief.medium && creativeBrief.medium !== 'photographic' && creativeBrief.medium !== 'digital photography'

    lines.push('')
    lines.push('=== RULES ===')
    if (isIllustration) {
      lines.push('Write each prompt using the 5-element structure: COMPOSITION → SUBJECT → ACTION → ENVIRONMENT & TECHNIQUE → MEDIUM & FINISH.')
      lines.push('1. Element 1 (Composition): viewpoint + focal hierarchy + spatial arrangement — this is the opening sentence.')
      lines.push('2. Element 2 (Subject): physical description as depicted in the medium.')
      lines.push('3. Element 3 (Action): concrete pose, gesture, or energy state — no abstract emotions.')
      lines.push('4. Element 4 (Environment & Technique): spatial depth with artistic treatment + light as rendered by artist + medium-specific atmosphere.')
      lines.push('5. Element 5 (Medium & Finish): color treatment VERBATIM + medium technique + artistic texture detail.')
      lines.push(`6. The medium is "${creativeBrief.medium}" — every prompt must produce output in this artistic style, not photographic.`)
    } else {
      lines.push('Write each prompt using the 5-element structure: CINEMATOGRAPHY → SUBJECT → ACTION → CONTEXT & ENVIRONMENT → STYLE & AMBIANCE.')
      lines.push('1. Element 1 (Cinematography): shot scale + angle + placement — this is the opening sentence.')
      lines.push('2. Element 2 (Subject): physical description bound to a spatial anchor.')
      lines.push('3. Element 3 (Action): concrete pose, gesture, or energy state — no abstract emotions.')
      lines.push('4. Element 4 (Context & Environment): 3 depth planes with optical treatment + light through visible effect + atmospheric detail.')
      lines.push('5. Element 5 (Style & Ambiance): color grade VERBATIM + color references on named surfaces (natural descriptions preferred, hex only when critical) + organic texture cue.')
    }
    lines.push(`6. NEVER name equipment, ${isIllustration ? 'artists' : 'cinematographers'}, directors, or film titles.`)
    lines.push('7. Each frame compositionally DISTINCT from every other.')
    lines.push('8. The creative vision and emotional intent inform what to emphasize — not how to write it.')
    lines.push('9. The ORIGINAL CREATIVE DIRECTION above contains hard constraints. If it says "no faces visible", NO prompt shows a face. If it says "wide framing", every prompt uses wide framing. These are non-negotiable.')
    lines.push('10. AUTHORITY HIERARCHY: User constraints > Visual ground truth (color/texture/atmosphere) > Brief (structure/composition). Never let the brief override what the images actually look like.')

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
      // Creative vision — the art direction layer
      if (creativeBrief.creativeVision) {
        lines.push('')
        lines.push('=== CREATIVE VISION — YOUR NORTH STAR ===')
        lines.push(`VISION: ${creativeBrief.creativeVision}`)
        lines.push(`METAPHOR: ${creativeBrief.visualMetaphor}`)
        lines.push(`SURPRISE ELEMENT: ${creativeBrief.unexpectedElement}`)
        lines.push(`DOMINANT PRIORITY: ${creativeBrief.dominantCreativePriority}`)
      }

      // Per-frame shot cards — compositional contract for each clip
      if (creativeBrief.concepts?.length > 0) {
        lines.push('')
        lines.push('=== PER-FRAME SHOT CARDS ===')
        lines.push('Each shot card defines the COMPOSITION and EMOTION of one clip. Translate into temporal language with camera movement and action.')
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
        lines.push('CRITICAL: Each clip must be visually DISTINCT — different camera movement, different scale, different energy.')
      }

      lines.push('')
      lines.push('=== GLOBAL VISUAL IDENTITY (shared across all clips) ===')
      lines.push(`COLOR GRADE (copy VERBATIM): ${creativeBrief.colorGrade}`)
      lines.push(`COLOR ANCHORS: ${creativeBrief.colorAnchors.join(', ')}`)
      lines.push(`LIGHT SOURCE: ${creativeBrief.lightSource}`)
      lines.push(`MATERIALS: ${creativeBrief.materials}`)
      lines.push(`MOOD (baseline): ${creativeBrief.mood}`)
      lines.push(`SUBJECT: ${creativeBrief.subjectDirection}`)
      lines.push(`ENVIRONMENT: ${creativeBrief.environmentDirection}`)
      lines.push(`MOTIFS: ${creativeBrief.visualMotifs.join(' | ')}`)
      lines.push(`ARC: ${creativeBrief.narrativeArc}`)
    }

    if (visualStyleCues) {
      lines.push('\n=== VISUAL GROUND TRUTH (AUTHORITATIVE for color, texture, atmosphere) ===')
      lines.push(visualStyleCues.description)
      lines.push(`Reference Palette: ${visualStyleCues.hexPalette.join(', ')}`)
      lines.push('Use as color guidance — natural descriptions preferred over hex codes.')
      if (visualStyleCues.visualKeywords?.length > 0) {
        lines.push(`Visual qualities: ${visualStyleCues.visualKeywords.join(' | ')}`)
      }
    }

    if (userInputs.description.trim()) {
      lines.push('\n=== ORIGINAL CREATIVE DIRECTION (hard constraints) ===')
      lines.push(userInputs.description)
    }

    lines.push('\n=== VIDEO RULES ===')
    lines.push('Focus on motion, camera movement, and temporal evolution. The reference image (if any) establishes the visual ground truth — your prompt adds the temporal dimension.')
    lines.push('AUTHORITY: User constraints > Visual ground truth > Brief.')
    lines.push('Each clip must be compositionally DISTINCT from every other.')

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

ENHANCEMENT APPROACH:
- Replace vague language with specific, descriptive language
- Convert keyword lists into complete sentences with semantic relationships
- If lighting is vague or missing, describe light through its visible effect (or artistic rendering if the prompt describes an illustration)
- If atmosphere is vague or missing, add sensory details (air quality, surface reflections, environmental texture)
- If texture is missing, add medium-appropriate texture cues (film grain for photos, brushwork/paper for illustrations)
- Remove filler, synonym chains, meta-language ("a photograph of"), abstract adjectives alone
- Replace name-dropping (cinematographers, directors, artists, film titles) with descriptions of the visual quality

MEDIUM AWARENESS:
If the reference images are illustrations/paintings or the user's prompt describes an illustration style:
- Enhance using artistic vocabulary (composition, brushwork, medium technique) instead of photographic vocabulary (camera angle, depth of field, film grain)
- Describe light as an artistic choice, not physical behavior
- Add medium-specific texture cues (watercolor blooms, impasto ridges, ink bleed) instead of photographic ones
If the content is photographic, enhance with cinematic vocabulary as usual.

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
