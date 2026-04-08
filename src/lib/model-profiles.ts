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

/** Runtime validation sets — prevents arbitrary model/mode names from reaching OpenRouter. */
export const VALID_TARGET_MODELS = new Set<string>([
  'nanobanana-2', 'flux-2-klein-9b', 'veo-3-1', 'kling-v3', 'kling-o3', 'ltxv-2-3',
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
- Conversational, directive tone — describe the scene as if directing a scene
- Can handle any prompt length but be specific about what matters
- Supports up to 14 reference object images
- Character consistency for up to 5 characters
- Specify technical photography details: lens type, ISO, lighting technique
- Include era/style explicitly: "2000s aesthetic", "Kodak Portra film"
- Deep reasoning — the model understands your prompt before generating`,
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
    promptRules: `FLUX 2 KLEIN 9B — TEXT ENCODER: Qwen3-8B-FP8 (decoder-only LLM, text-only)
Architecture: ~1B flow DiT + 8B text encoder. Features from Qwen3 layers [9,18,27] → 12,288-dim context. 4-step distilled, CFG=1.0.

CRITICAL: ~77 ACTIVE TOKENS (~50-100 words). Every word must earn its place. No upsampling — Klein encodes EXACTLY what you write.

POSITIONAL BIAS (Qwen3 causal attention):
- First 25%: STRONGEST → shot geometry + primary subject here
- Middle 50%: MODERATE → environment, atmosphere, depth planes, lighting quality
- Last 25%: WEAKEST → grade, texture cues
OPEN every prompt with SHOT GEOMETRY in the first 6 words: angle + scale + energy.
Example: "A wide, low-angle action shot" — this front-loads the compositional skeleton.
Then immediately place the primary subject in relationship to a spatial anchor.

CINEMATIC LIGHTING — THE MOST IMPORTANT RULE:
NEVER name lighting equipment (softbox, HMI, key light, fill, bounce, reflector, diffusion panel).
Klein renders equipment names as OBJECTS IN THE SCENE — you will get softboxes visible in the image.
NEVER name cinematographers, directors, or film titles — Klein cannot interpret these as style references.
Instead, describe light through its VISIBLE EFFECT on the scene:
- Direction and behavior: "cold light cutting across from the left", "warm glow pooling on the floor"
- Quality through effect: "overcast and flattened, giving a bluish desaturated tone", "harsh side-light carving deep shadows"
- Shadow as subject: "deep shadow swallowing the background", "half the face lost in darkness"
- Color temperature as feeling: "cold blue-grey wash", "warm amber spill", "tungsten warmth against cool daylight"
- Atmosphere: "hazy air distorting the distance", "dust motes catching light", "rain-wet reflections on dark pavement"
Write prompts like storyboard descriptions — describe the scene and what the atmosphere FEELS like.

WHAT WORKS WELL:
- Storyboard-style descriptions — describe the scene, how the atmosphere feels
- Light described through effect: "cold overcast wash with bluish flattened tone", not equipment names
- Hex codes bound to surfaces: "the wall is #2C3E50" — Klein follows hex values extremely well
- Material textures: "brushed aluminum", "raw silk", "cracked leather", "rain-spotted concrete"
- Emotional composition: "grounded and urgent perspective", "oppressive weight", "quiet tension"
- Sensory atmosphere: "slightly wet or reflective ground", "hazy air", "dust-settled surfaces"

ANTI-AI MEASURES (include in EVERY prompt):
Klein's 1B flow model over-sharpens and smooths. Counteract with:
- Organic texture: "visible pores", "film grain", "subtle halation on highlights"
- Environmental wear: "scuffed surfaces", "dust-settled", "sun-faded", "asymmetric composition"
- Analog character: "analog color shift", "gentle vignetting", "slight lens imperfection"
- AVOID: "sharp focus", "crisp details", "high quality", "8k" — amplify synthetic look

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
    promptRules: `VEO 3.1 RULES:
- Structure: Shot spec > Setting > Subject > Action > Audio/Dialogue
- Dialogue uses COLON format: "A man says: Hello there" — NOT quotes
- Include "(no subtitles)" when dialogue is present
- ONE dominant action per clip — don't overload
- Sensory language for atmosphere: textures, temperatures, sounds
- Film stock references work: "shot on 35mm", "VHS texture"
- Specify camera movement explicitly: dolly, tracking, crane, pan
- Focus prompt on TEMPORAL changes — what moves, how the camera behaves, what transitions happen
- Do NOT re-describe visual content that the reference image already provides
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
    promptRules: `KLING V3 RULES:
- Multi-shot: label each shot explicitly "Shot 1: [framing] [subject] [motion]"
- Character labels: [Character A: Description] with persistent identifiers
- Dialogue tags with tone: [Character A, whispering]: "line here"
- Temporal markers: "Immediately", "Pause", "After a beat"
- Up to 6 shots in a single generation, up to 15 seconds
- Describe camera relationship to subject: tracking, following, freezing
- Professional film vocabulary works well: profile shot, rack focus, push-in
- For image-to-video: describe motion and scene evolution, not the static image content`,
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
    promptRules: `KLING O3 (OMNI) RULES:
- Same multi-shot structure as Kling v3 but with enhanced reasoning
- Omni model excels at complex scene understanding and multi-character interactions
- Character labels: [Character A: Description] with persistent identifiers
- Dialogue tags with tone: [Character A, whispering]: "line here"
- Temporal markers: "Immediately", "Pause", "After a beat"
- Up to 6 shots in a single generation
- Describe camera relationship to subject: tracking, following, freezing
- Professional film vocabulary: profile shot, rack focus, push-in, dutch angle
- For image-to-video: focus on temporal changes, not static visual description`,
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

PROMPT FORMAT: A single flowing paragraph in PRESENT TENSE. 4–8 sentences, matched to video duration.
Match prompt detail to duration — underdescribed prompts for 8-10s clips cause rushed, incomplete motion.

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
