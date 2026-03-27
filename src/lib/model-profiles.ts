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
  | 'flux-2-pro'
  | 'z-image'
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
  'flux-2-pro': {
    id: 'flux-2-pro',
    label: 'Flux 2 Pro',
    modes: ['generate'],
    promptFormat: 'natural',
    optimalLengthMin: 40,
    optimalLengthMax: 80,
    supportsNegativePrompts: false,
    maxReferenceImages: 9,
    knownWeaknesses: ['hands', 'text-rendering'],
    promptRules: `FLUX 2 [PRO] — TEXT ENCODER: Mistral-Small-3.2-24B (24B decoder-only VLM)
Features extracted from layers [10, 20, 30] → 15,360-dim → projected to 6,144. Token limit: 512. BFL-recommended optimal: 40-80 words.

ENCODER-SPECIFIC RULES (from BFL official docs and arXiv:2507.09595):
- WORD ORDER IS CRITICAL: BFL explicitly documents positional bias — "FLUX.2 pays more attention to what comes first." Order strictly: Main subject → Key action → Critical style → Essential context → Secondary detail. Never bury the lead.
- Natural language sentences only. No comma-separated keyword tags — Mistral was trained on natural language and encodes sentence relationships, not keyword frequency.
- No negative prompts (not supported architecturally).
- No meta-language: never write "a photograph of", "an image of", "cinematic shot of" — describe the scene directly.
- Hex codes for color: BFL specifically recommends "#FF5733" style notation over vague color names — Mistral's world knowledge encodes color science precisely.
- Lighting: use technique names, not adjectives. "Single-source HMI through 4×4 light grid" beats "dramatic lighting." Mistral knows what these setups look like.
- 40-80 words optimal. Longer prompts (up to 150 words) for complex multi-element scenes. Beyond 150: diminishing returns and attention dilution.`,
  },
  'z-image': {
    id: 'z-image',
    label: 'Z-Image',
    modes: ['generate'],
    promptFormat: 'structured',
    optimalLengthMin: 100,
    optimalLengthMax: 300,
    supportsNegativePrompts: false,
    maxReferenceImages: 0,
    knownWeaknesses: ['hands', 'contradictory-styles'],
    promptRules: `Z-IMAGE — TEXT ENCODER: Qwen3-4B (decoder-only LLM, bilingual Chinese/English)
Architecture: S3-DiT — text tokens, visual semantic tokens, and image tokens are CONCATENATED into a single unified sequence. 3D RoPE: text tokens occupy the temporal dimension; image tokens occupy spatial dimensions. Source: arXiv:2511.22699 (ByteDance/Tongyi MAI).

ENCODER-SPECIFIC RULES (from arXiv:2511.22699 and Qwen3 architecture):
- Natural language sentences, NOT keyword tags. However, Z-Image's training regime included "long, medium and short captions, as well as tags and simulated user prompts" (paper Section 3.2) — making it more tolerant of both styles than other LLM-encoder models.
- Positional bias applies (decoder-only causal attention): put the most critical visual concepts in the first sentence. Text at the end of a long prompt competes with fewer attended tokens.
- The single-stream architecture means text and image tokens share the same attention budget. Keep prompts dense but focused — verbose prompts have diminishing returns as image tokens dominate the sequence.
- Bilingual: Chinese-language prompts are natively supported with full fidelity (Qwen3-4B is bilingual by design).
- 100-300 words optimal. Short (25-50 words) for quick iteration; 150-300 for detailed production prompts.
- NO negative prompts — encode constraints positively.
- COLOR ANCHORING CRITICAL: Single-stream attention means color language must be explicit and identical across all prompts. One color grade phrase + 2-3 hex codes repeated verbatim. Any paraphrase diverges the output.
- Brand/designer references: Qwen3-4B has broad world knowledge and may recognize some fashion references — but translate to visual properties regardless for maximum reliability.`,
  },
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
    modes: ['edit'],
    promptFormat: 'natural',
    optimalLengthMin: 40,
    optimalLengthMax: 100,
    supportsNegativePrompts: false,
    maxReferenceImages: 4,
    knownWeaknesses: ['fine-detail-at-speed'],
    promptRules: `FLUX 2 KLEIN 9B — TEXT ENCODER: Qwen3-8B-FP8 (decoder-only, text-only LLM)
Features extracted from layers [9, 18, 27] → 12,288-dim context. Token limit: 512. "9B" = combined system (~1B flow model + 8B text encoder). Source: FLUX.2-klein-9B HF model card; DeepWiki code analysis.

ENCODER-SPECIFIC RULES:
- Natural language sentences — Qwen3-8B is instruction-tuned and processes coherent language far better than keyword lists (thinking mode disabled: enable_thinking=False in FLUX.2's implementation).
- Positional bias: front-load the most critical visual concepts. Qwen3's causal attention means early tokens receive more cross-attention from later tokens — what you say first has more influence.
- Text-only encoder: no multimodal capability, no prompt upsampling, no content filtering. What you write is what gets encoded.
- No negative prompts (not supported).
- Hex codes for color specificity — Qwen3 has strong color science vocabulary from its LLM training corpus.
- 40-100 words optimal for editing tasks (focused, single-intent). The 4-step distilled inference favors concise, high-signal prompts.`,
    editRules: `FLUX 2 KLEIN 9B EDIT RULES:
- Prompt-driven editing — no masks needed, up to 4 reference images
- Describe the desired RESULT, not the operation: what should the final image look like, not "change X to Y"
- Single intent per prompt yields cleanest edits — this is a 4-step model optimized for speed over complexity
- For color changes: use hex codes directly in a natural sentence ("the background shifts to a deep slate #2C3E50")
- Strength of edit is controlled by inference parameters, not prompt verbosity — keep the prompt tight`,
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
    case 'generate': return 'flux-2-pro'
    case 'edit': return 'nanobanana-2'
    case 'video': return 'veo-3-1'
  }
}

export const DEFAULT_MODE: GenerationMode = 'generate'
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
