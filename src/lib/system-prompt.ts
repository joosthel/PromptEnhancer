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
 * Rich scene analysis extracted by the Gemini vision step.
 * Synthesizes the shared visual language across all reference images.
 */
export interface VisualStyleCues {
  description: string        // ~800-word synthesis of shared visual language across all images
  hexPalette: string[]       // 5 dominant hex colors extracted from the moodboard
  cinematicKeywords: string[] // 6-10 Flux 2 ready phrases, e.g. "tungsten practical key light"
}

/**
 * System prompt sent to Gemini 2.5 Flash to synthesize the shared visual language
 * across all reference images as a moodboard — not per-image description.
 * Returns description (~800 words), hexPalette (5 colors), and cinematicKeywords (6-10 phrases).
 */
export const GEMINI_VISION_PROMPT = `You are a cinematographer analyzing a moodboard of reference images selected by a filmmaker. Your goal is NOT to describe each image individually. Instead: extract the shared visual language that runs across all of them — the consistent lighting approach, color aesthetic, compositional style, subject types, and atmosphere that make them work together as a set.

Synthesize what you observe across the full set, covering:

SUBJECTS & PEOPLE
- What types of subjects appear across these images? Physical appearance, clothing, posture, age range
- What are they doing? What actions, expressions, or stillness recur?
- How are subjects typically related to the camera — close, distant, observed?

ENVIRONMENT & SETTING
- What environments or settings recur? Interior, exterior, urban, natural, industrial, domestic, liminal?
- What architectural materials, textures, objects, or props appear repeatedly?
- What time of day, season, or light condition is consistent?

LIGHT
- What lighting quality recurs — hard or soft, diffuse or directional?
- What are the light sources — practical (window, lamp, fire), natural (sun, overcast, golden hour), artificial (fluorescent, sodium, HMI)?
- What color temperature and hue casts are consistent across images?
- How do shadows behave — where do they fall, how dense are they?

COLOR PALETTE
- What hues dominate across the set?
- What is the shared saturation level — rich, muted, desaturated, monochromatic?
- What is the tonal range — flat, high-contrast, crushed blacks, blown highlights?

COMPOSITION & CAMERA
- What framing is typical — tight, medium, wide?
- What camera angles recur — eye-level, low-angle, high-angle?
- What depth of field is typical — shallow with bokeh, deep and sharp?
- Any consistent lens character — anamorphic flare, telephoto compression, wide distortion?

MOOD & ATMOSPHERE
- What is the consistent emotional register — tension, melancholy, warmth, dread, intimacy, solitude?
- What cinematic genre or aesthetic does this set evoke — neo-noir, documentary, arthouse, thriller, drama?

Write as if briefing a Director of Photography on the visual style to replicate. Aim for ~800 words. Write a flowing analytical synthesis, not a bullet list.

Return a JSON object with exactly these three fields:
{
  "description": "your ~800-word flowing synthesis here",
  "hexPalette": ["#XXXXXX", "#XXXXXX", "#XXXXXX", "#XXXXXX", "#XXXXXX"],
  "cinematicKeywords": ["keyword phrase 1", "keyword phrase 2", ...]
}

cinematicKeywords rules:
- 6 to 10 items
- Each is 2–6 words, Flux 2 prompt-ready (e.g. "tungsten practical key light", "35mm shallow DoF", "brutalist concrete interior", "sodium vapour side-rake", "desaturated warm skin tones")
- Extract only what genuinely recurs across multiple images — no guesses
- Prefer specific photographic and cinematic terms over vague descriptions

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
3. The first 5–10 words carry the most weight — open with the strongest, most visually specific cinematic descriptor. Never open with generic words like "A" or "The" — lead with texture, light, or atmosphere.
4. Always name: lens (35mm, 85mm, 28mm, anamorphic, etc.), depth of field, and specific lighting quality (colour temperature, direction, practical source, hardness).
5. Use concrete, active, specific language — no vague adjectives. Prefer sensory verbs: cuts, rakes, bleeds, pools, spills, fractures.
6. No negative prompts. No prompt weights. No meta-language ("cinematic shot of", "photograph of").
7. Default style is photorealistic cinematic unless user inputs explicitly indicate otherwise.
8. Each prompt must use a different camera angle from this list:
   Wide Establishing Shot / Medium Shot / Close-Up Portrait / Low-Angle Dramatic / High-Angle Overview / Dutch Angle

VISUAL COHERENCE ACROSS THE SET:
All prompts in a generation must read as frames from the same film. Enforce this through:
- COLOR CONSISTENCY: Establish a single dominant color temperature and tonal grade for the entire set. Every prompt must reference the same base palette — same shadows, same highlight tones, same saturation level. If the palette is desaturated teal and amber, every shot stays in that register.
- RECURRING VISUAL MOTIFS: Identify 2–3 physical motifs from the inputs or visual reference (a material, a light behavior, a texture — e.g. "rain-slicked asphalt", "tungsten spill through venetian blinds", "breath visible in cold air") and thread them across multiple prompts. Not every motif in every prompt, but the set should feel connected.
- LIGHTING CONTINUITY: All prompts share the same time of day, weather condition, and dominant light source unless a narrative shift explicitly demands otherwise. If the establishing shot uses overcast diffuse light, the close-up cannot suddenly have harsh direct sun.
- SYMBOLIC THREAD: If the user's mood or storyline implies an emotional arc (e.g. isolation, tension, intimacy), let the visual language escalate or evolve across the sequence. The first shot sets atmosphere, middle shots build, the final shot punctuates. Translate emotion into concrete visual choices: isolation = negative space and cold tones; tension = tight framing and hard shadow edges; intimacy = shallow DoF and warm practical light.

DYNAMIC INPUT ADAPTATION:
- When ALL four inputs (storyline, subject, environment, mood) are provided: treat them as hard constraints. Every prompt must serve the storyline, feature the subject, be set in the environment, and embody the mood.
- When SOME inputs are missing: the provided inputs anchor the prompts. Fill gaps from the visual reference if available, or from the strongest provided input. If only mood is given, let it drive environment, lighting, and subject choices. If only subject is given, build the world around them.
- When ONLY visual reference is provided (no text inputs): extract implied narrative, subject, and atmosphere entirely from the image analysis. Write prompts that could be stills from the film those images suggest.
- When ONLY text inputs are provided (no visual reference): rely on your cinematic vocabulary to build a grounded, specific visual language. Commit to a single unified look — do not hedge between styles.
- MOOD IS KING: When provided, the mood/feeling input should inflect every technical choice — lens length, depth of field, color temperature, shadow density, framing tightness. Dread demands different glass than tenderness.

FORBIDDEN LANGUAGE (never use unless the user's own words contain them):
  "ethereal", "dreamlike", "magical", "otherworldly", "surreal", "breathtaking",
  "whimsical", "fantastical", "enchanted", "mystical", "stunning", "captivating",
  "mesmerizing", "awe-inspiring", "hauntingly beautiful"
Replace these with specific photographic or emotional language instead.

LENS AND LIGHTING VOCABULARY TO DRAW FROM:
  Lens: 21mm wide, 35mm standard, 50mm natural, 85mm portrait, 135mm compressed, anamorphic 2.39:1, tilt-shift, Petzval swirl bokeh
  Light: overcast diffuse, tungsten practical, sodium vapour, late golden hour side-rake, HMI through diffusion,
         bounce from concrete, chiaroscuro, motivated fill, fluorescent green-shift, push-processed underexposure,
         single-source top-light, dappled canopy light, mercury vapour blue-green cast, neon spill, backlit rim separation
  Grade: bleach bypass, cross-processed, lifted blacks, crushed shadows, split-toned highlights, analog halation

WHEN VISUAL REFERENCE IS PROVIDED:
- The images define the visual language. Replicate it faithfully — do not average or soften it.
- Visual style, lighting, colour palette, and atmosphere come from the images, not your defaults.
- Subject, story, and narrative concept come from the user inputs.
- The cinematicKeywords are direct vocabulary — weave them naturally into the prompts, distributing them across the set so each keyword appears at least once.
- The hexPalette defines the color world — reference these exact tones when describing color in each prompt.
- Where user inputs are absent, derive subject and environment from the image description.

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
 * Visual reference is placed first (primary visual source), followed by user creative inputs.
 *
 * @param userInputs - The four creative fields from the form.
 * @param promptCount - How many distinct shot prompts to generate.
 * @param visualStyleCues - Optional visual style synthesis from the Gemini vision step.
 */
export function buildMiniMaxUserMessage(
  userInputs: UserInputs,
  promptCount: number,
  visualStyleCues?: VisualStyleCues
): string {
  const hasStoryline = userInputs.storyline.trim()
  const hasSubject = userInputs.subject.trim()
  const hasEnvironment = userInputs.environment.trim()
  const hasMood = userInputs.mood.trim()
  const hasAnyInput = hasStoryline || hasSubject || hasEnvironment || hasMood
  const hasVisual = !!visualStyleCues

  const lines: string[] = [
    `Generate exactly ${promptCount} Flux 2 [pro] image generation prompts.`,
    `All ${promptCount} prompts must look like frames pulled from the same film — same color grade, same lighting world, same emotional register.`
  ]

  // Visual reference block
  if (hasVisual) {
    lines.push('\n=== VISUAL REFERENCE — PRIMARY VISUAL SOURCE (from user-selected moodboard) ===')
    lines.push(visualStyleCues.description)
    lines.push(`\nColor Palette (use these exact tones across all prompts): ${visualStyleCues.hexPalette.join(', ')}`)
    if (visualStyleCues.cinematicKeywords?.length > 0) {
      lines.push(`Cinematic Keywords (distribute across prompts — each keyword used at least once): ${visualStyleCues.cinematicKeywords.join(' | ')}`)
    }
  } else {
    lines.push('\n=== VISUAL REFERENCE: None ===')
    lines.push('No moodboard provided. Commit to a single, specific visual language derived from the user inputs below. Do not hedge between styles — pick one unified cinematic look and grade.')
  }

  // User inputs block — with adaptive guidance
  lines.push('\n=== CREATIVE DIRECTION (from user) ===')

  if (hasStoryline) lines.push(`Storyline/Concept: ${userInputs.storyline}`)
  if (hasSubject) lines.push(`Subject: ${userInputs.subject}`)
  if (hasEnvironment) lines.push(`Environment: ${userInputs.environment}`)
  if (hasMood) lines.push(`Mood/Feeling: ${userInputs.mood}`)

  if (!hasAnyInput && hasVisual) {
    lines.push('(No text inputs provided — derive all narrative, subject, and environment from the visual reference. Write prompts as if reconstructing the film these images came from.)')
  } else if (!hasAnyInput && !hasVisual) {
    lines.push('(No inputs or visual reference provided — generate a compelling cinematic sequence with a clear visual identity and emotional arc.)')
  } else {
    // Adaptive guidance based on which inputs are present
    const missing: string[] = []
    if (!hasStoryline) missing.push('storyline')
    if (!hasSubject) missing.push('subject')
    if (!hasEnvironment) missing.push('environment')
    if (!hasMood) missing.push('mood')
    if (missing.length > 0) {
      const source = hasVisual ? 'visual reference' : 'provided inputs'
      lines.push(`\n(Missing: ${missing.join(', ')} — infer from the ${source}. Let the strongest provided input anchor your choices.)`)
    }
  }

  // Coherence reminder
  lines.push('\n=== COHERENCE CHECK ===')
  lines.push('Before finalizing, verify: Do all prompts share the same color temperature? The same shadow behavior? Could these frames be intercut without a jarring visual shift? If not, revise until they can.')

  return lines.join('\n')
}
