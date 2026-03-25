/**
 * @file model-profiles.ts
 * Defines target models, their prompt profiles, and fix categories.
 * This is the shared data layer used by the prompt engine, API routes, and UI.
 */

// ---------------------------------------------------------------------------
// Target Models
// ---------------------------------------------------------------------------

export type TargetModel =
  | 'flux-2-pro'
  | 'z-image'
  | 'z-image-turbo'
  | 'nanobanana-2'
  | 'midjourney-v8'
  | 'veo-3'
  | 'kling-3'

export type ModelCategory = 'image' | 'video'

export interface ModelProfile {
  id: TargetModel
  label: string
  shortLabel: string
  category: ModelCategory
  promptFormat: 'natural' | 'structured' | 'conversational'
  optimalLengthMin: number
  optimalLengthMax: number
  supportsNegativePrompts: boolean
  specialSyntax?: string
  knownWeaknesses: string[]
  promptRules: string
}

export const MODEL_PROFILES: Record<TargetModel, ModelProfile> = {
  'flux-2-pro': {
    id: 'flux-2-pro',
    label: 'Flux 2 Pro',
    shortLabel: 'Flux2',
    category: 'image',
    promptFormat: 'natural',
    optimalLengthMin: 70,
    optimalLengthMax: 120,
    supportsNegativePrompts: false,
    knownWeaknesses: ['hands', 'text-rendering'],
    promptRules: `FLUX 2 [PRO] RULES:
- First 5-10 words carry the most weight — open with the strongest visual descriptor
- 70-120 words. Density earns quality.
- Always name: lens, depth of field, specific lighting quality
- No negative prompts. No prompt weights. No meta-language ("cinematic shot of", "photograph of")
- Use concrete, active, specific language — sensory verbs: cuts, rakes, bleeds, pools, spills
- Lead with texture, light, or atmosphere — never open with "A" or "The"`,
  },
  'z-image': {
    id: 'z-image',
    label: 'Z-Image',
    shortLabel: 'ZImg',
    category: 'image',
    promptFormat: 'structured',
    optimalLengthMin: 80,
    optimalLengthMax: 250,
    supportsNegativePrompts: false,
    knownWeaknesses: ['hands', 'contradictory-styles'],
    promptRules: `Z-IMAGE RULES:
- 6-part structure: Subject > Scene > Composition > Lighting > Style > Constraints
- 80-250 words optimal. Over 300 may truncate.
- NO negative prompts — all constraints go in the positive prompt
- Include "sharp focus", "crisp details" explicitly for quality
- Specify camera and lens: "Shot on Leica M6 with Kodak Portra 400 film grain"
- Avoid contradictory styles ("photorealistic cartoon")
- Limit to 3-5 primary visual concepts per prompt`,
  },
  'z-image-turbo': {
    id: 'z-image-turbo',
    label: 'Z-Image Turbo',
    shortLabel: 'ZTurbo',
    category: 'image',
    promptFormat: 'structured',
    optimalLengthMin: 60,
    optimalLengthMax: 200,
    supportsNegativePrompts: false,
    knownWeaknesses: ['hands', 'fine-detail'],
    promptRules: `Z-IMAGE TURBO RULES:
- Same 6-part structure as Z-Image but shorter is fine (60-200 words)
- Optimized for speed — be concise, front-load the most important elements
- NO negative prompts — constraints in positive prompt
- Include explicit quality cues: "sharp focus", "detailed textures"`,
  },
  'nanobanana-2': {
    id: 'nanobanana-2',
    label: 'NanoBanana 2',
    shortLabel: 'NB2',
    category: 'image',
    promptFormat: 'conversational',
    optimalLengthMin: 30,
    optimalLengthMax: 500,
    supportsNegativePrompts: false,
    knownWeaknesses: ['physics-constraints'],
    promptRules: `NANOBANANA 2 (Gemini 3.1 Flash Image) RULES:
- Conversational, directive tone — describe the scene as if directing a photographer
- Can handle any prompt length but be specific about what matters
- Supports up to 14 reference object images
- Character consistency for up to 5 characters
- Specify technical photography details: lens type, ISO, lighting technique
- Include era/style explicitly: "2000s aesthetic", "Kodak Portra film"
- Deep reasoning — the model understands your prompt before generating`,
  },
  'midjourney-v8': {
    id: 'midjourney-v8',
    label: 'Midjourney V8',
    shortLabel: 'MJv8',
    category: 'image',
    promptFormat: 'natural',
    optimalLengthMin: 40,
    optimalLengthMax: 150,
    supportsNegativePrompts: true,
    knownWeaknesses: ['text-rendering', 'specific-poses'],
    promptRules: `MIDJOURNEY V8 RULES:
- Natural language, front-load the subject and style
- 40-150 words optimal
- Supports --no flag for negative prompts (append at end)
- Responds well to artist/photographer references
- Excels at artistic direction — lean into aesthetic language
- Use aspect ratio hints when relevant`,
  },
  'veo-3': {
    id: 'veo-3',
    label: 'Veo 3',
    shortLabel: 'Veo3',
    category: 'video',
    promptFormat: 'natural',
    optimalLengthMin: 50,
    optimalLengthMax: 300,
    supportsNegativePrompts: false,
    specialSyntax: 'dialogue-colon',
    knownWeaknesses: ['multiple-simultaneous-actions', 'physics'],
    promptRules: `VEO 3 RULES:
- Structure: Shot spec > Setting > Subject > Action > Audio/Dialogue
- Dialogue uses COLON format: "A man says: Hello there" — NOT quotes
- Include "(no subtitles)" when dialogue is present
- ONE dominant action per clip — don't overload
- Sensory language for atmosphere: textures, temperatures, sounds
- Film stock references work: "shot on 35mm", "VHS texture"
- Specify camera movement explicitly: dolly, tracking, crane, pan
- Duration: 4s, 6s, or 8s per generation`,
  },
  'kling-3': {
    id: 'kling-3',
    label: 'Kling 3',
    shortLabel: 'Kling3',
    category: 'video',
    promptFormat: 'structured',
    optimalLengthMin: 60,
    optimalLengthMax: 400,
    supportsNegativePrompts: true,
    specialSyntax: 'character-labels',
    knownWeaknesses: ['rapid-scene-changes'],
    promptRules: `KLING 3 RULES:
- Multi-shot: label each shot explicitly "Shot 1: [framing] [subject] [motion]"
- Character labels: [Character A: Description] with persistent identifiers
- Dialogue tags with tone: [Character A, whispering]: "line here"
- Temporal markers: "Immediately", "Pause", "After a beat"
- Up to 6 shots in a single generation, up to 15 seconds
- Describe camera relationship to subject: tracking, following, freezing
- Professional film vocabulary works well: profile shot, rack focus, push-in`,
  },
}

export const IMAGE_MODELS = Object.values(MODEL_PROFILES).filter(m => m.category === 'image')
export const VIDEO_MODELS = Object.values(MODEL_PROFILES).filter(m => m.category === 'video')
export const DEFAULT_MODEL: TargetModel = 'flux-2-pro'

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
    instruction: 'Hands are visible in this scene — add explicit five-finger anatomy, natural hand positioning, relaxed grip. Specify what the hands are doing.',
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

// ---------------------------------------------------------------------------
// Prompt variant tracking
// ---------------------------------------------------------------------------

export interface PromptVariant {
  label: string
  variants: Partial<Record<TargetModel, string>>
  activeModel: TargetModel
  history: Array<{
    prompt: string
    fix: string
    timestamp: number
  }>
}
