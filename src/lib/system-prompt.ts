/**
 * @file system-prompt.ts
 * Shared types and the Gemini vision prompt for moodboard analysis.
 */

/** Freeform creative description provided by the user. */
export interface UserInputs {
  description: string
}

/** Optional label attached to a reference image. */
export interface ImageLabel {
  index: number
  label: string
}

/**
 * Rich scene analysis extracted by the Gemini vision step.
 * Focuses on connecting concepts across all reference images.
 */
export interface VisualStyleCues {
  description: string
  mediumType: 'photograph' | 'illustration' | '3d-render' | 'mixed'
  mediumDetail: string
  hexPalette: string[]
  visualKeywords: string[]
  atmosphere: string
}

/**
 * A single concept extracted from the user's input, ranked by visual importance.
 * Each frame in the final set is built around ONE primary concept.
 */
export interface ConceptAssignment {
  concept: string
  role: 'primary' | 'supporting' | 'atmosphere'
  frame: number
  fiveWordPitch: string
  shotScale: string
  cameraAngle: string
  subjectPlacement: string
  depthPlanes: string
  energyState: string
  cameraToLight: string
  emotionalIntent: string
  framePriority: string
  sensoryHook: string
}

/**
 * Locked creative brief that sits between vision analysis and prompt generation.
 * Every prompt is derived strictly from this document — zero creative drift.
 */
export interface CreativeBrief {
  creativeVision: string
  visualMetaphor: string
  unexpectedElement: string
  dominantCreativePriority: string
  concepts: ConceptAssignment[]
  colorGrade: string
  colorAnchors: string[]
  lightSource: string
  materials: string
  mood: string
  subjectDirection: string
  environmentDirection: string
  visualMotifs: string[]
  narrativeArc: string
  fullBrief: string
  medium?: string
}

/**
 * System prompt for the vision analysis step.
 * Primary goal: describe reference images LITERALLY, then extract production cues.
 */
export const GEMINI_VISION_PROMPT = `You are describing reference images for a production pipeline. Your description will be used downstream to write prompts for AI image generation. Accuracy is critical — the pipeline trusts your description completely.

ANTI-HALLUCINATION RULES (MANDATORY):
- Describe what you LITERALLY SEE. A person is a person. A chair is a chair. An object is an object.
- NEVER reinterpret, symbolize, or assign artistic meaning. If you see two men in a gallery, say "two men standing in a gallery" — NOT "two statues" or "two figures frozen in contemplation."
- NEVER infer what something "represents." Describe what it IS.
- If you're uncertain what something is, say so: "what appears to be..." — don't guess with confidence.
- Describe age, clothing, posture, and spatial relationships as they literally appear.

DESCRIPTION STRUCTURE — analyze in this order:

0. MEDIUM IDENTIFICATION (first — determines how you describe everything else)
Identify the artistic medium of each image:
- Is this a photograph (digital or film), a 3D render, or an illustration/painting?
- If illustration/painting: what medium? (watercolor, oil, acrylic, ink, gouache, digital painting, pencil, mixed media)
- What technique details are visible? (brushwork, paper texture, stroke style, paint opacity, mark-making)

If the images are illustrations/paintings, adjust ALL subsequent descriptions:
- Describe light as an ARTISTIC CHOICE (how the artist rendered light), not as physical light behavior
- Describe depth as COMPOSITIONAL (foreground/background treatment in the medium), not as optical focus
- Describe texture as the MEDIUM'S texture (paper grain, brush marks, paint thickness), not surface physics

1. SUBJECTS & OBJECTS (most important)
What is literally in the images? Describe every visible subject and significant object.
- People: number, approximate age, clothing, posture, facial expression, what they're doing
- Objects: what they are, their condition, size relative to other elements
- Spatial relationships: who/what is where relative to what else, distances, foreground/midground/background placement
- Composition: viewpoint, framing, what's centered vs. off-center

2. ENVIRONMENT & SPACE
The physical setting as it literally appears.
- Indoor/outdoor, type of space (gallery, street, studio, forest, etc.)
- Architecture, walls, floors, ceilings — materials and condition
- Depth: how deep the space is, what's visible at different distances
- Time of day if determinable from light

3. LIGHT
For photographs: How light behaves in the scene — direction, quality, shadow behavior, color temperature, contrast.
For illustrations: How the artist RENDERED light — wash gradients, white paper as highlight, painted shadow shapes, tonal transitions, contrast as artistic choice.

4. COLOR
The actual colors present in the images.
- Dominant colors as they appear on specific surfaces and objects
- Overall color character: saturated, muted, monochromatic, vivid, etc.
- If the palette is distinctive, note up to 5 representative hex colors from specific surfaces. These are advisory reference points, not binding constraints. Fewer is fine if the palette is simple or monochromatic.

5. MATERIALS, SURFACES & TECHNIQUE
For photographs: What things are made of and how they look under the light (worn, pristine, matte, glossy).
For illustrations: The artistic medium's visible qualities — paper texture, brushwork, paint opacity, stroke character, mark-making technique, medium-specific effects (watercolor blooms, impasto ridges, ink bleed, etc.).

6. ATMOSPHERE
The overall feel derived from VISIBLE elements — not invented narrative.
- One sentence describing the atmosphere as a viewer would experience it

Write a ~400-word description. Be CONCRETE and SPECIFIC throughout. "A man in a dark blue suit standing near a white wall" beats "a figure in an elegant space." The downstream pipeline depends on literal accuracy.

Return a JSON object with exactly these fields:
{
  "description": "your ~400-word literal description of what the images show",
  "mediumType": "photograph | illustration | 3d-render | mixed",
  "mediumDetail": "specific medium and technique — e.g. 'loose watercolor on rough paper with wet-on-wet blooms' or 'digital photography with natural grade'",
  "hexPalette": ["#XXXXXX", ...],
  "visualKeywords": ["keyword phrase 1", "keyword phrase 2", ...],
  "atmosphere": "one sentence — the overall feel derived from visible elements"
}

mediumType rules:
- "photograph" for photos (digital or film) and photorealistic renders
- "illustration" for paintings, drawings, watercolors, ink work, digital painting, any hand-made or painterly art
- "3d-render" for clearly CGI/3D rendered scenes that aren't photorealistic
- "mixed" if the set contains both photographs and illustrations

mediumDetail rules:
- Be specific about the technique: "loose watercolor with visible paper texture and wet-on-wet blooms" not just "watercolor"
- For photographs: note the quality/style: "digital photography, natural color" or "film photography, warm analog tones"

hexPalette rules:
- Up to 5 colors sampled from actual surfaces/objects visible in the images (fewer is fine — return an empty array if the palette is unremarkable)
- If provided, include range: at least one dark, one midtone, one light/accent
- Order: darkest → lightest

visualKeywords rules:
- 6 to 10 items
- Each is 2–6 words describing a visible compositional or atmospheric quality
- For photographs: "low-angle ground perspective", "wide negative space left", "shallow depth of field"
- For illustrations: "visible brushstrokes", "paper texture bleeding through", "soft wet-on-wet edges", "hand-painted light gradients"
- Describe what you SEE, not what you interpret

Return ONLY valid JSON, nothing else.`
