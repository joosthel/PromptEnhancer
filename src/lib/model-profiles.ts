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
- First 25%: STRONGEST → primary subject here
- Middle 50%: MODERATE → environment, atmosphere, lighting quality
- Last 25%: WEAKEST → camera, grade, texture cues
Front-load the primary concept. What you say first dominates.

CINEMATIC LIGHTING — THE MOST IMPORTANT RULE:
NEVER name lighting equipment (softbox, HMI, key light, fill, bounce, reflector, diffusion panel).
Klein renders equipment names as OBJECTS IN THE SCENE. You will get softboxes and light rigs visible in the image.
Instead, use CINEMATOGRAPHER and FILM REFERENCES to invoke lighting quality:
- "Roger Deakins lighting" → precise single-source, deep motivated shadows, naturalistic color
- "Greig Fraser cinematography" → desaturated haze, silhouettes against scale, amber-teal tension
- "Emmanuel Lubezki natural light" → magic hour, available light, God-rays
- "lit like Blade Runner 2049" → warm amber pooling in cold blue void, fog diffusion
- "lit like The Godfather" → faces emerging from deep shadow, warm overhead practical light
- "Bradford Young underexposed richness" → shadow detail that breathes, dark skin luminosity
Describe how light FALLS and FEELS, not what creates it: "warm spill from the next room", "cold window light cutting across", "single shaft of light from above"

WHAT WORKS WELL:
- Camera bodies invoke color science: "Shot on Canon EOS R5", "Shot on Hasselblad X2D", "Shot on ARRI Alexa Mini"
- Film stocks: "Kodak Portra 400", "Fuji Velvia", "Expired Ektachrome 64", "35mm film grain"
- Hex codes bound to surfaces: "the wall is #2C3E50" — Klein follows hex values extremely well
- Material textures: "brushed aluminum", "raw silk", "cracked leather", "rain-spotted concrete"
- Cinematographer names as lighting shorthand — invokes their entire visual language

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
