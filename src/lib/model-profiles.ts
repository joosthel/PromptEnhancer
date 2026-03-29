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
// Target Models
// ---------------------------------------------------------------------------

export type TargetModel =
  | 'nanobanana-2'
  | 'flux-2-klein-9b'
  | 'veo-3-1'
  | 'kling-v3'
  | 'kling-o3'
  | 'ltxv-2-3'

export interface ModelProfile {
  id: TargetModel
  label: string
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
    modes: ['generate', 'edit'],
    promptFormat: 'conversational',
    optimalLengthMin: 30,
    optimalLengthMax: 500,
    supportsNegativePrompts: false,
    maxReferenceImages: 14,
    knownWeaknesses: ['physics-constraints'],
    promptRules: `NANOBANANA 2 (Gemini 3.1 Flash Image) RULES:
- Conversational, directive tone — describe the scene as if directing a photographer
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
Write prompts like storyboard descriptions — what the camera SEES and what the atmosphere FEELS like.

WHAT WORKS WELL:
- Storyboard-style descriptions — what the camera sees, how the atmosphere feels
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
    modes: ['video'],
    promptFormat: 'natural',
    optimalLengthMin: 60,
    optimalLengthMax: 250,
    supportsNegativePrompts: true,
    maxReferenceImages: 1,
    knownWeaknesses: ['complex-physics', 'chaotic-multi-element-scenes', 'text-rendering', 'logos'],
    promptRules: `LTX-VIDEO 2.3 (LTXV 22B by Lightricks) RULES:
API: fal-ai/ltx-2.3/text-to-video — Resolutions: 1080p / 1440p / 2160p. Duration: 6s / 8s / 10s. Generates audio by default.

PROMPT FORMAT: A single flowing paragraph in PRESENT TENSE. 4–8 sentences matched to shot scale.
Write like a present-tense storyboard description — what is happening RIGHT NOW, not what will happen.

STRUCTURE ORDER:
1. Shot establishment — camera angle, scale, framing
2. Scene setting — environment, light, color, atmosphere
3. Subject and action — who/what is in frame and what they're doing (motion as continuous present)
4. Character detail — age, clothing, hair, distinguishing features. Express emotion through PHYSICAL CUES only, not abstract labels ("her jaw tightens" not "she feels afraid")
5. Camera movement — explicit movement with timing: "The camera slowly dolls in as...", "A steady handheld tracks..."
6. Audio — ambient sounds, music quality, dialogue (in quotation marks), speech characteristics

WHAT WORKS WELL:
- Atmospheric elements: fog, mist, golden-hour light, rain, steam, smoke
- Explicit camera language: "slow dolly in", "handheld tracking", "crane rises", "static wide"
- Emotive human moments with subtle physical gestures
- Stylized aesthetics: painterly quality, noir atmosphere, animation-style
- Strategic single light sources: motivated practicals, natural window light, golden hour
- Present-tense verbs: "stands", "turns", "walks", "catches light", "diffuses across"
- Characters talking and singing — the model handles dialogue and lip sync reliably

WHAT TO AVOID:
- Internal emotional states — use physical/visual cues only
- Text, logos, signage — unreliable rendering
- Complex physics: water splashing, explosions, chaotic crowd movement
- Overloaded scenes — too many simultaneous actions compete for quality
- Conflicting light logic — one motivated light source per scene
- Overcomplicated prompts — start simple, add layers

NEGATIVE PROMPT GUIDANCE:
LTX-Video 2.3 supports a separate negative prompt. Generate one per clip that addresses likely failure modes for that specific content type. Common effective negatives:
- Quality: "worst quality, low quality, deformed, distorted, disfigured, blurry, pixelated, low resolution, grainy, noisy"
- Motion: "inconsistent motion, jittery, choppy motion, static frame, freeze, unnatural motion, jerky"
- Artifacts: "compression artifacts, jpeg artifacts, digital artifacts, glitches, noise"
- Style: "watermark, text overlay, logo, signature, subtitle, caption"
- Physics: "bad anatomy, extra limbs, floating objects, disconnected body parts"
Tailor the negative prompt to the specific content — a portrait needs different negatives than a landscape.

CAMERA MOVEMENT VOCABULARY:
"slowly dolls in" / "pulls back to reveal" / "tracks alongside" / "crane rises above" / "handheld follows"
"pans across" / "tilts up to reveal" / "orbits around" / "static locked frame" / "slow push toward"
Specify movement relative to subject: "the camera moves with", "as the camera rises, the subject..."`,
  },
}

export function getModelsForMode(mode: GenerationMode): ModelProfile[] {
  return Object.values(MODEL_PROFILES).filter(m => m.modes.includes(mode))
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
