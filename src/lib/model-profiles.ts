/**
 * @file model-profiles.ts
 * Defines target models, their prompt profiles, generation modes, and fix categories.
 * This is the shared data layer used by the prompt engine, API routes, and UI.
 */

// ---------------------------------------------------------------------------
// Generation Modes
// ---------------------------------------------------------------------------

export type GenerationMode = 'generate' | 'edit' | 'video'

export const GENERATION_MODES: Array<{ id: GenerationMode; label: string }> = [
  { id: 'generate', label: 'Generate' },
  { id: 'edit', label: 'Edit' },
  { id: 'video', label: 'Video' },
]

// ---------------------------------------------------------------------------
// App Modes (top-level UI modes)
// ---------------------------------------------------------------------------

export type AppMode = 'enhance' | 'generate' | 'artdirection'

export const APP_MODES: Array<{ id: AppMode; label: string; tagline: string }> = [
  { id: 'enhance', label: 'Prompt Enhancement', tagline: 'Optimize an existing prompt for any model' },
  { id: 'generate', label: 'Prompt Generation', tagline: 'Reference images + description to model-specific prompts' },
  { id: 'artdirection', label: 'Art Direction', tagline: 'Develop creative briefs and visual narratives' },
]

// ---------------------------------------------------------------------------
// Target Models
// ---------------------------------------------------------------------------

export type TargetModel =
  | 'nanobanana-2'
  | 'flux-2-klein-9b'
  | 'veo-3-1'
  | 'kling-v3'
  | 'kling-o3'
  | 'ltxv-2-3'
  | 'seedance'

/** Runtime validation sets — prevents arbitrary model/mode names from reaching OpenRouter. */
export const VALID_TARGET_MODELS = new Set<string>([
  'nanobanana-2', 'flux-2-klein-9b', 'veo-3-1', 'kling-v3', 'kling-o3', 'ltxv-2-3', 'seedance',
])
export const VALID_GENERATION_MODES = new Set<string>(['generate', 'edit', 'video'])

export interface ModelProfile {
  id: TargetModel
  label: string
  description: string
  modes: GenerationMode[]
  promptFormat: 'natural' | 'structured' | 'conversational'
  optimalLengthMin: number
  optimalLengthMax: number
  supportsNegativePrompts: boolean
  maxReferenceImages: number
  specialSyntax?: string
  knownWeaknesses: string[]
  promptRules: string
  editRules?: string
}

export const MODEL_PROFILES: Record<TargetModel, ModelProfile> = {
  'nanobanana-2': {
    id: 'nanobanana-2',
    label: 'NanoBanana 2',
    description: 'Fast and flexible. Up to 14 reference images with character consistency.',
    modes: ['generate', 'edit'],
    promptFormat: 'conversational',
    optimalLengthMin: 30,
    optimalLengthMax: 500,
    supportsNegativePrompts: false,
    maxReferenceImages: 14,
    knownWeaknesses: ['physics-constraints'],
    promptRules: `NANOBANANA 2 (Gemini 3.1 Flash Image) RULES:
- Conversational, directive tone — describe the scene as if directing it
- Lead with INTENT: "Editorial portrait", "Product hero shot", "Lifestyle campaign image"
- Camera hardware as style controller: "Canon R5, 85mm f/1.8", "Fujifilm X-T5", "Hasselblad medium format" — activates specific training patterns
- Supports up to 14 reference object images with character consistency for 5+ characters
- Technical photography details work well: lens type, ISO, lighting technique, film stock
- Include era/style: "2000s aesthetic", "Kodak Portra film", "Wes Anderson palette"
- Cinematographer and director name-dropping WORKS on this model (unlike Klein)
- Light as physics: name the source ("north-facing window", "golden hour backlight"), describe behavior on surfaces
- Deep reasoning — the model understands intent before generating`,
    editRules: `NANOBANANA 2 EDIT RULES:
- Describe the desired RESULT, not the change operation
- The model uses semantic understanding — no masks or region selection needed
- Be specific about what should change and what should be preserved
- For style transfer: describe the target style, the reference image provides the content
- For compositing: describe the final scene, reference images provide the elements
- One major change per prompt yields best results
- Can handle multi-image input: combine elements from multiple references`,
  },
  'flux-2-klein-9b': {
    id: 'flux-2-klein-9b',
    label: 'Flux 2 Klein 9B',
    description: 'Best for cinematic stills. Keep prompts concise (50-100 words).',
    modes: ['generate', 'edit'],
    promptFormat: 'natural',
    optimalLengthMin: 50,
    optimalLengthMax: 100,
    supportsNegativePrompts: false,
    maxReferenceImages: 4,
    knownWeaknesses: ['over-sharpening', 'plastic-skin', 'multi-constraint-instability', 'missing-organic-texture'],
    promptRules: `FLUX 2 KLEIN 9B — TEXT ENCODER: Qwen3-8B-FP8 (decoder-only LLM)
Architecture: ~1B flow DiT + 8B text encoder. 4-step distilled, CFG=1.0.

WRITE LIKE A NOVELIST, NOT A SEARCH ENGINE. Complete sentences describing what the camera sees — not keyword lists.

CRITICAL: ~77 ACTIVE TOKENS (~50-100 words). Every word earns its place. No upsampling — Klein encodes EXACTLY what you write.

POSITIONAL BIAS (Qwen3 causal attention):
- First 25%: STRONGEST → intent + primary subject here
- Middle 50%: MODERATE → environment, light, depth planes
- Last 25%: WEAKEST → grade, texture cues
OPEN with INTENT + SUBJECT: "Editorial portrait of a woman resting her chin on her hand" — front-loads the concept.

LIGHT AS PHYSICS — THE MOST IMPORTANT RULE:
NEVER name equipment (softbox, HMI, key light, reflector) — Klein renders them as objects.
NEVER name cinematographers, directors, or film titles — Klein can't interpret style references.
Instead: name the PHYSICAL SOURCE and describe its effect:
- "Window light from camera-left, cold blue wash across the floor"
- "Overhead fluorescent, flat even illumination, minimal shadow"
- "Golden hour backlight, warm amber rimming the shoulders"

WHAT WORKS:
- Intent-first: "Product hero shot", "Cinematic noir still" — sets the creative frame
- Physical light sources with visible effect on surfaces
- Material textures: "brushed aluminum", "cracked leather", "rain-spotted concrete"
- Hex codes on surfaces: "the wall is #2C3E50" — Klein follows hex values well
- One texture cue per prompt: "film grain", "visible pores", "subtle halation"

ANTI-AI: Klein over-sharpens. Include 1 texture cue: "film grain", "slight lens imperfection", "natural skin texture"
AVOID: "sharp focus", "crisp details", "high quality", "8k" — amplify synthetic look

NO negative prompts. NO prompt weights. NO meta-language ("a photograph of").
50-100 words for T2I. 40-80 for editing.`,
    editRules: `FLUX 2 KLEIN 9B EDIT RULES:
- Prompt-driven editing — no masks needed, up to 4 reference images
- Describe the desired RESULT, not the operation
- Single intent per prompt — the 4-step distilled inference favors focused prompts
- Hex codes for color: "the background shifts to a deep slate #2C3E50"
- 40-80 words optimal for edits — shorter and more targeted than generation prompts
- Include anti-AI cues even in edit prompts: "natural texture", "organic feel", "visible grain"`,
  },
  'veo-3-1': {
    id: 'veo-3-1',
    label: 'Veo 3.1',
    description: 'Google video. Structured scenes with camera, dialogue, and audio.',
    modes: ['video'],
    promptFormat: 'natural',
    optimalLengthMin: 50,
    optimalLengthMax: 300,
    supportsNegativePrompts: false,
    maxReferenceImages: 1,
    specialSyntax: 'dialogue-colon',
    knownWeaknesses: ['multiple-simultaneous-actions', 'physics'],
    promptRules: `VEO 3.1 RULES — 7-LAYER FRAMEWORK:
1. Camera + lens: shot scale, camera movement with timing, lens character
2. Subject: physical description, position in frame
3. Action + physics: ONE dominant action using physics-based verbs ("pushes", "drifts", "strikes")
4. Setting + atmosphere: environment, time, weather, sensory texture
5. Light source: name the PHYSICAL source ("golden hour backlight", "overhead fluorescent"), describe behavior
6. Style/texture: "shot on 35mm", "VHS texture", film stock references work well
7. Audio/dialogue: dialogue uses COLON format — "A man says: Hello there" (NOT quotes). Include "(no subtitles)" with dialogue.

KEY RULES:
- ONE dominant action per clip — don't overload with simultaneous movements
- Physics-based verbs for stable motion: "pushes through", "settles into", "drifts across"
- Material cues stabilize subjects: "wool coat", "brushed steel", "wet asphalt"
- Focus on TEMPORAL evolution — what changes, not what's static
- Do NOT re-describe visual content the reference image already provides
- Duration: 4s, 6s, or 8s per generation`,
  },
  'kling-v3': {
    id: 'kling-v3',
    label: 'Kling v3',
    description: 'Multi-shot video with character labels and temporal markers.',
    modes: ['video'],
    promptFormat: 'structured',
    optimalLengthMin: 60,
    optimalLengthMax: 400,
    supportsNegativePrompts: true,
    maxReferenceImages: 1,
    specialSyntax: 'character-labels',
    knownWeaknesses: ['rapid-scene-changes'],
    promptRules: `KLING V3 RULES — THINK LIKE A FILM DIRECTOR:
- Multi-shot: label each shot "Shot 1: [framing] [subject] [motion]"
- Character labels: [Character A: Description] with persistent identifiers
- Dialogue tags with tone: [Character A, whispering]: "line here"
- Temporal markers for pacing: "Immediately", "Pause", "After a beat"
- Up to 6 shots, up to 15 seconds
- Cinematic camera terms: dolly push, whip-pan, crash zoom, rack focus, push-in
- ALWAYS anchor hands to objects — "grips the railing", "wraps around the mug" (not floating gestures)
- Physics-based verbs: "pushes", "pulls", "settles", "strikes" — not abstract descriptions
- Material cues stabilize subjects: "leather jacket", "wooden table", "concrete floor"
- For image-to-video: describe MOTION and evolution, not static content`,
  },
  'kling-o3': {
    id: 'kling-o3',
    label: 'Kling o3',
    description: 'Enhanced Kling with deeper scene understanding for complex sequences.',
    modes: ['video'],
    promptFormat: 'structured',
    optimalLengthMin: 60,
    optimalLengthMax: 400,
    supportsNegativePrompts: true,
    maxReferenceImages: 1,
    specialSyntax: 'character-labels',
    knownWeaknesses: ['rapid-scene-changes'],
    promptRules: `KLING O3 (OMNI) RULES — THINK LIKE A FILM DIRECTOR:
- Same multi-shot structure as Kling v3 with enhanced reasoning for complex scenes
- Excels at multi-character interactions and complex scene understanding
- Character labels: [Character A: Description] with persistent identifiers
- Dialogue tags: [Character A, whispering]: "line here"
- Temporal markers: "Immediately", "Pause", "After a beat"
- Up to 6 shots per generation
- Cinematic camera: dolly push, whip-pan, crash zoom, rack focus, dutch angle
- ALWAYS anchor hands to objects — prevents floating gesture artifacts
- Physics-based verbs for motion stability: "pushes", "settles", "drifts"
- For image-to-video: focus on temporal evolution, not static description`,
  },
  'ltxv-2-3': {
    id: 'ltxv-2-3',
    label: 'LTX-Video 2.3',
    description: 'High-resolution video (up to 4K). Flowing present-tense with audio.',
    modes: ['video'],
    promptFormat: 'natural',
    optimalLengthMin: 80,
    optimalLengthMax: 400,
    supportsNegativePrompts: true,
    maxReferenceImages: 1,
    knownWeaknesses: ['complex-physics', 'chaotic-multi-element-scenes', 'text-rendering', 'high-frequency-patterns'],
    promptRules: `LTX-VIDEO 2.3 (LTXV 22B by Lightricks) RULES:
Architecture: 22B DiT with gated attention text connector — prompts followed precisely. New VAE: sharper detail, cleaner edges.
API: fal-ai/ltx-2.3/text-to-video — 1080p/1440p/2160p · 6s/8s/10s · native audio generation.
CFG: keep at 4.0 or below. Above 4.0 causes contrast burn, ringing, and flicker artifacts.

PROMPT FORMAT: A single flowing paragraph in PRESENT TENSE. Match prompt length to video duration:
- 6s clips: 4-5 sentences, focused and direct
- 8s clips: 5-7 sentences, more environmental detail
- 10s clips: 6-8 sentences, full scene development
Underdescribed prompts for long clips cause rushed, incomplete motion. Overdescribed short clips cause cramming.

STRUCTURE ORDER:
1. Shot establishment — camera angle, scale, framing
2. Scene setting — environment, light, color, atmosphere
3. Subject and action — motion as continuous present ("walks", "rotates", "catches light")
4. Character detail — age, clothing, hair. Express emotion through PHYSICAL CUES only ("her jaw tightens" not "she feels afraid")
5. Camera movement — explicit with timing: "The camera slowly dolls in as...", "A steady pan reveals..."
6. Audio — ambient sounds, dialogue in quotation marks, music quality, speech characteristics

WHAT WORKS WELL:
- Atmospheric elements: fog, mist, golden-hour light, rain, steam, smoke, candlelight
- Explicit camera language: "slow dolly in", "steady tracking", "crane rises", "static wide", "shallow depth of field"
- Emotive human moments with subtle physical gestures and specific character detail
- Commercial/product: "luxury bottle rotating slowly with dramatic rim lighting on black background"
- Single motivated light source — golden hour, tungsten, practical window light
- Cinematic terms: "anamorphic", "macro lens", "telephoto compression", "cinematic color grading"
- Dialogue and lip sync — the model handles speaking characters reliably

WHAT TO AVOID:
- Internal emotional states — physical cues only
- Text, logos, signage — unreliable rendering
- "handheld chaotic" — causes warping artifacts
- Complex physics: explosions, chaotic water, crowd stampedes
- Conflicting light logic (two sources with opposite directions)
- High-frequency micro-patterns: brick walls, mesh, micro-check fabric
- Overloaded scenes — one dominant action per clip
- Numeric specifications: "exactly 3 birds at 45 degrees" — use descriptive language instead

NEGATIVE PROMPT GUIDANCE (MANDATORY — tailored per clip):
LTX-2.3 supports negative prompts. Build one per clip from these categories:
- Motion artifacts: "morphing, distortion, warping, flickering, jitter, stutter, temporal artifacts, frame blending, unnatural motion"
- Quality: "low quality, blurry, pixelated, oversaturated, distorted, low resolution, grainy, jpeg artifacts"
- Unwanted elements: "watermark, text overlay, logo, subtitle, caption, cartoon, CGI"
- Technical: "black frames, freezing frames, inconsistent motion, static freeze"
- Content-specific: portrait → "bad anatomy, extra limbs, disfigured face"; landscape → "floating objects, disconnected elements"; action → "motion smearing, stuttering"
Tailor to the SPECIFIC content — a close portrait has different failure modes than a wide establishing shot.

CAMERA MOVEMENT VOCABULARY:
"slowly dolls in" / "pulls back to reveal" / "tracks alongside" / "crane rises above" / "static locked frame"
"pans across" / "tilts up to reveal" / "orbits around" / "shallow depth of field push" / "wide establishing hold"
Specify relative to subject: "as the camera rises, the subject shrinks against the horizon"`,
  },
  'seedance': {
    id: 'seedance',
    label: 'Seedance',
    description: 'ByteDance video. Front-load subject, physics-based motion, supports negative prompts.',
    modes: ['video'],
    promptFormat: 'natural',
    optimalLengthMin: 50,
    optimalLengthMax: 300,
    supportsNegativePrompts: true,
    maxReferenceImages: 1,
    knownWeaknesses: ['text-rendering', 'complex-physics', 'rapid-scene-changes'],
    promptRules: `SEEDANCE (ByteDance) RULES:
- 50-300 words optimal. Front-load subject and action in the first 25% of the prompt.
- Natural language, present tense. No keyword stuffing or weight syntax.
- Supports negative prompts — use for quality control and unwanted artifacts.
- ONE dominant action per clip — don't overload with simultaneous movements.
- Physics-based verbs for motion: "pushes", "pulls", "strikes", "drifts", "settles" — not abstract descriptions.
- Camera equipment as style: "shot on 35mm Cooke anamorphic" activates specific training patterns.
- Light as physics: name the source and direction ("golden hour backlight from behind subject"), not quality alone.
- Explicit camera movement with timing: "slow dolly in over 4 seconds", "static locked wide shot"
- Material cues stabilize subjects: "wool coat", "brushed aluminum", "wet asphalt" — concrete surfaces reduce morphing.
- For image-to-video: describe TEMPORAL evolution and motion, not the static image content.
- Duration: 4s to 8s per generation.`,
  },
}

export function getModelsForMode(mode: GenerationMode): ModelProfile[] {
  return Object.values(MODEL_PROFILES).filter(m => m.modes.includes(mode))
}

export function getModelsForAppMode(appMode: AppMode, subMode: GenerationMode): ModelProfile[] {
  if (appMode === 'artdirection') return Object.values(MODEL_PROFILES).filter(m => m.modes.includes('generate'))
  if (appMode === 'enhance') return getModelsForMode(subMode)
  return getModelsForMode(subMode)
}

export function getDefaultModelForMode(mode: GenerationMode): TargetModel {
  switch (mode) {
    case 'generate': return 'flux-2-klein-9b'
    case 'edit': return 'nanobanana-2'
    case 'video': return 'veo-3-1'
  }
}

export const DEFAULT_MODE: GenerationMode = 'generate'
export const DEFAULT_MODEL: TargetModel = 'flux-2-klein-9b'

// ---------------------------------------------------------------------------
// Fix Categories
// ---------------------------------------------------------------------------

export interface FixCategory {
  id: string
  label: string
  instruction: string
}

export const FIX_CATEGORIES: FixCategory[] = [
  {
    id: 'hands',
    label: 'Hands',
    instruction: 'Hands are visible — describe the gesture, grip, and purpose with precision. Focus on what the hands are doing and how they relate to surrounding objects. Natural, purposeful hand descriptions produce better results than anatomical correction instructions.',
  },
  {
    id: 'lighting',
    label: 'Lighting',
    instruction: 'Lighting feels inconsistent or generic — make it more specific: name the exact source (practical, natural, artificial), color temperature in Kelvin, direction, quality (hard/soft), and falloff behavior.',
  },
  {
    id: 'composition',
    label: 'Composition',
    instruction: 'Framing feels off — strengthen the composition: specify depth planes (foreground/midground/background), negative space, leading lines, and subject placement within the frame.',
  },
  {
    id: 'too-ai',
    label: 'Too AI',
    instruction: 'This reads too polished/synthetic — add surface imperfection: weathering, grain, uneven skin texture with visible pores, environmental grit, asymmetric clutter, sun-faded materials, dust-settled surfaces. Make it look lived-in and real.',
  },
  {
    id: 'mood',
    label: 'Mood',
    instruction: 'Emotional register is weak — intensify the atmosphere through lens choice (wider = isolation, tighter = intimacy), shadow density, color temperature shift, and environmental storytelling details that reinforce the feeling.',
  },
  {
    id: 'scale',
    label: 'Scale',
    instruction: 'Object sizes feel ambiguous — specify relative scale between elements, distance from camera, spatial relationships, and human-scale reference points.',
  },
  {
    id: 'text',
    label: 'Text',
    instruction: 'Remove any text, typography, signage, or written elements from the scene description — these should be composited in post-production, not generated.',
  },
  {
    id: 'sharpen',
    label: 'Sharpen',
    instruction: 'Details feel soft — add sharpness cues: material textures (fabric weave, wood grain, metal brushing), surface detail, pore-level skin texture, crisp edge definition.',
  },
  {
    id: 'longer',
    label: 'Longer',
    instruction: 'Prompt is too sparse — expand with additional environmental detail, light behavior, material specifics, and atmospheric texture. Fill out the visual world.',
  },
  {
    id: 'shorter',
    label: 'Shorter',
    instruction: 'Prompt is too dense — tighten to core visual elements only. Remove redundant modifiers, collapse synonym chains, keep the strongest descriptor for each concept.',
  },
]
