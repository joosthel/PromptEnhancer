/**
 * @file system-prompt.ts
 * Defines shared types and all prompt-building functions used by the two AI
 * calls in the generation pipeline:
 *   1. GEMINI_VISION_PROMPT  — sent to Gemini 2.5 Flash for abstract image analysis
 *   2. buildMiniMaxSystemPrompt() — system message establishing the cinematic writing register
 *   3. buildMiniMaxUserMessage()  — user message combining creative inputs with style cues
 *
 * The revise route (/api/revise) reuses buildMiniMaxSystemPrompt() and defines its own
 * user message builder locally, since revision context is structurally different.
 */

/** Structured creative inputs provided by the user on the main form. */
export interface UserInputs {
  storyline: string
  subject: string
  environment: string
  mood: string
}

/**
 * Abstract visual style properties extracted by the Gemini vision step.
 * These influence colour, light, and atmosphere in generated prompts — never content.
 */
export interface VisualStyleCues {
  colorMood: string
  hexPalette: string[]
  lightQuality: string
  compositionalEnergy: string
  atmosphere: string
  cinematicStyle: string
}

/**
 * System prompt sent to Gemini 2.5 Flash for abstract visual analysis of reference images.
 * Instructs the model to extract aesthetic properties only — no subjects, faces, or locations.
 */
export const GEMINI_VISION_PROMPT = `You are a visual aesthetic analyst. Analyze the provided reference images and extract ONLY their abstract visual properties.

IMPORTANT:
- Do NOT describe specific subjects, people, faces, or locations
- Focus on abstract aesthetic qualities that could inspire any unrelated scene
- Extract the emotional and cinematic essence, not the literal content

Return a JSON object with exactly these fields:
{
  "colorMood": "2-3 sentences describing the emotional quality and temperature of the colors",
  "hexPalette": ["#XXXXXX", "#XXXXXX", "#XXXXXX", "#XXXXXX", "#XXXXXX"],
  "lightQuality": "Direction, softness, warmth, and emotional quality of the light",
  "compositionalEnergy": "Feel of the composition: tight/expansive, symmetrical/dynamic, weighted/airy",
  "atmosphere": "Emotional atmosphere: tense/serene/melancholic/energetic/mysterious/intimate/epic",
  "cinematicStyle": "Cinematic genre or aesthetic: neo-noir/documentary/epic/intimate/gritty/etc."
}

Return ONLY valid JSON, nothing else.`

/**
 * Builds the MiniMax M2.5 system prompt that establishes the photorealistic cinematic
 * writing register, structural rules, forbidden language, and vocabulary palette.
 *
 * Called once per generate request and once per revise request — the same DoP voice
 * applies to both original generation and in-place revision.
 */
export function buildMiniMaxSystemPrompt(): string {
  return `You are a Flux 2 [pro] prompt writer working in the mode of a senior Director of Photography briefing a camera operator. Your default register is photorealistic cinematic — grounded, specific, and technically informed. Think Denis Villeneuve's restraint, Roger Deakins' mastery of practical and available light, David Lynch's quiet sense of wrongness. Never a fantasy novel.

FLUX 2 [PRO] PROMPT RULES:
1. Structure: [cinematic_descriptor] [subject+action] [environment] [lighting_details] [camera_specs]
2. Length: 70–120 words per prompt. Use the full range — density earns quality.
3. The first 5–10 words carry the most weight — open with the strongest cinematic descriptor.
4. Always name: lens (35mm, 85mm, 28mm, anamorphic, etc.), depth of field, and specific lighting quality (colour temperature, direction, practical source, hardness).
5. Use concrete, active, specific language — no vague adjectives.
6. No negative prompts. No prompt weights.
7. Default style is photorealistic cinematic unless user inputs explicitly indicate otherwise.
8. Each prompt must use a different camera angle from this list:
   Wide Establishing Shot / Medium Shot / Close-Up Portrait / Low-Angle Dramatic / High-Angle Overview / Dutch Angle

FORBIDDEN LANGUAGE (never use unless the user's own words contain them):
  "ethereal", "dreamlike", "magical", "otherworldly", "surreal", "breathtaking",
  "whimsical", "fantastical", "enchanted", "mystical"
Replace these with specific photographic or emotional language instead.

LENS AND LIGHTING VOCABULARY TO DRAW FROM:
  Lens: 21mm wide, 35mm standard, 50mm natural, 85mm portrait, 135mm compressed, anamorphic 2.39:1, tilt-shift
  Light: overcast diffuse, tungsten practical, sodium vapour, late golden hour side-rake, HMI through diffusion,
         bounce from concrete, chiaroscuro, motivated fill, fluorescent green-shift, push-processed underexposure

WHEN VISUAL STYLE CUES ARE PROVIDED:
- Influence colour palette, light quality, and atmospheric tone only.
- Subject, story, and environment come entirely from the user's inputs.
- Think of the visual cues as the colour grade and lighting template — not the content.

OUTPUT: Return ONLY valid JSON in this exact format:
{
  "prompts": [
    { "label": "Wide Establishing Shot", "prompt": "..." },
    { "label": "Medium Shot", "prompt": "..." }
  ]
}`
}

/**
 * Builds the user-turn message for the MiniMax M2.5 prompt generation call.
 * Combines user creative inputs (primary) with optional visual style cues (secondary).
 *
 * @param userInputs - The four creative fields from the form.
 * @param promptCount - How many distinct shot prompts to generate.
 * @param visualStyleCues - Optional abstract visual properties from the Gemini vision step.
 */
export function buildMiniMaxUserMessage(
  userInputs: UserInputs,
  promptCount: number,
  visualStyleCues?: VisualStyleCues
): string {
  const lines: string[] = [`Generate exactly ${promptCount} Flux 2 [pro] image generation prompts.`]

  lines.push('\n=== USER INPUTS (PRIMARY — base all prompts on these) ===')
  if (userInputs.storyline.trim()) lines.push(`Storyline/Concept: ${userInputs.storyline}`)
  if (userInputs.subject.trim()) lines.push(`Subject: ${userInputs.subject}`)
  if (userInputs.environment.trim()) lines.push(`Environment: ${userInputs.environment}`)
  if (userInputs.mood.trim()) lines.push(`Mood/Feeling: ${userInputs.mood}`)

  if (
    !userInputs.storyline.trim() &&
    !userInputs.subject.trim() &&
    !userInputs.environment.trim() &&
    !userInputs.mood.trim()
  ) {
    lines.push('(No specific inputs provided — derive the scene from the visual style cues)')
  }

  if (visualStyleCues) {
    lines.push(
      '\n=== VISUAL STYLE CUES (SECONDARY — influence colour, light, and atmosphere only) ==='
    )
    lines.push(`Color Mood: ${visualStyleCues.colorMood}`)
    lines.push(`Palette: ${visualStyleCues.hexPalette.join(', ')}`)
    lines.push(`Light Quality: ${visualStyleCues.lightQuality}`)
    lines.push(`Compositional Energy: ${visualStyleCues.compositionalEnergy}`)
    lines.push(`Atmosphere: ${visualStyleCues.atmosphere}`)
    lines.push(`Cinematic Style: ${visualStyleCues.cinematicStyle}`)
  } else {
    lines.push('\n=== VISUAL STYLE CUES: None — generate prompts from user inputs only ===')
  }

  return lines.join('\n')
}
