export interface UserInputs {
  storyline: string
  subject: string
  environment: string
  mood: string
}

export interface VisualStyleCues {
  colorMood: string
  hexPalette: string[]
  lightQuality: string
  compositionalEnergy: string
  atmosphere: string
  cinematicStyle: string
}

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
  "cinematicStyle": "Cinematic genre or aesthetic: neo-noir/documentary/epic/intimate/ethereal/gritty/etc."
}

Return ONLY valid JSON, nothing else.`

export function buildMiniMaxSystemPrompt(): string {
  return `You are an expert Flux 2 [pro] image generation prompt writer specializing in photorealistic, cinematic imagery optimized as video start frames.

FLUX 2 [PRO] PROMPT RULES:
1. Structure: [cinematic_descriptor] [subject+action] [environment] [lighting_details] [camera_specs]
2. Length: 40–80 words per prompt
3. The first 5–10 words carry the most weight — open with the strongest cinematic descriptor
4. Always include: lens type (35mm, 85mm, anamorphic, etc.), depth of field, specific lighting quality
5. Use concrete, active, specific language — no vague adjectives
6. No negative prompts. No prompt weights.
7. Photorealistic and cinematic — these will be used as video start frames
8. Each prompt must use a different camera angle from this list:
   Wide Establishing Shot / Medium Shot / Close-Up Portrait / Low-Angle Dramatic / High-Angle Overview / Dutch Angle

WHEN VISUAL STYLE CUES ARE PROVIDED:
- Let them influence the COLOR PALETTE, LIGHT QUALITY, and ATMOSPHERIC TONE only
- The subject, story, and environment come ENTIRELY from the user's inputs
- Think of the visual cues as the "color grading and lighting template" — not the content

OUTPUT: Return ONLY valid JSON in this exact format:
{
  "prompts": [
    { "label": "Wide Establishing Shot", "prompt": "..." },
    { "label": "Medium Shot", "prompt": "..." }
  ]
}`
}

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
      '\n=== VISUAL STYLE CUES (SECONDARY — influence color, light, and atmosphere only) ==='
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
