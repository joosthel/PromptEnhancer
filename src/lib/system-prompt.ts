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
  emotionalIntent: string
  shotScale: string
  cameraAngle: string
  subjectPlacement: string
  depthPlanes: string
  cameraEquipment?: string
}

/**
 * Locked creative brief that sits between vision analysis and prompt generation.
 * Every prompt is derived strictly from this document — zero creative drift.
 */
export interface CreativeBrief {
  intent: string
  technicalApproach: string
  creativeVision: string
  visualMetaphor: string
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
export const GEMINI_VISION_PROMPT = `You are extracting CREATIVE INTENT from reference images for an AI image/video generation pipeline. Your analysis tells the downstream prompt writer what KIND of image to create and what TECHNICAL CHOICES to make — not an inventory of visible objects.

ACCURACY RULES:
- Identify what things ARE (a person is a person, not a "figure" or "form"). If uncertain, say "what appears to be..."
- Never symbolize or assign artistic meaning. Describe literally, then extract the creative decisions.

Analyze in this order:

1. MEDIUM IDENTIFICATION
- Photograph (digital/film), illustration/painting (which medium?), 3D render, or mixed?
- For illustrations: what technique? (watercolor, oil, ink, digital painting, etc.)

2. IMAGE TYPE & GENRE (most important)
What kind of image is this? Name the genre and creative intent:
- "editorial portrait for jewelry campaign", "cinematic still from a thriller", "product hero shot", "lifestyle brand photography", "fine art landscape", "fashion editorial", "documentary street photography", etc.
- What aesthetic is it targeting? What would you call this if briefing a photographer or art director?

3. TECHNICAL SETUP
- What focal length does the perspective imply? (wide-angle distortion, normal perspective, telephoto compression)
- What is the PHYSICAL light source? Name it: "large window from camera-left", "overhead fluorescent", "golden hour backlight", "on-camera flash", "north-facing skylight". NOT adjectives like "soft" or "warm" alone.
- Color temperature: warm/cool/neutral and approximate Kelvin if determinable
- Depth of field: shallow isolation, deep focus, or moderate?
- For illustrations: how did the artist RENDER light? (wash gradients, unpainted paper highlights, painted shadow shapes)

4. KEY CREATIVE DECISIONS
The 3-5 choices that make these images WORK — not an object inventory, but the decisions a photographer/art director made that distinguish this from a generic version of the same subject:
- Composition strategy (why is the subject placed HERE and not there?)
- Color palette intention (what is the palette DOING emotionally?)
- Subject-to-environment relationship (dominant subject? environmental portrait? subject lost in space?)
- Any deliberate tension or contrast (warm/cool, sharp/soft, large/small, static/dynamic)

5. PRODUCTION NOTES
Anything the downstream prompt writer needs to reproduce this look:
- Notable materials or textures worth preserving
- Specific color relationships between surfaces
- Key atmosphere details (haze, rain, dust, clarity)

Write ~150-200 words total. Focus on CREATIVE DECISIONS, not element catalogues. "Editorial jewelry portrait, 85mm compression, single window source from camera-left, shallow depth isolating subject against clean neutral backdrop" beats "a woman with blonde hair wearing earrings and a necklace resting her chin on her hand."

Return a JSON object with exactly these fields:
{
  "description": "your ~150-200 word creative intent analysis",
  "mediumType": "photograph | illustration | 3d-render | mixed",
  "mediumDetail": "specific medium and technique — e.g. 'loose watercolor on rough paper with wet-on-wet blooms' or 'digital photography, natural color grade'",
  "hexPalette": ["#XXXXXX", ...],
  "visualKeywords": ["keyword phrase 1", "keyword phrase 2", ...],
  "atmosphere": "one sentence — the overall feel derived from visible elements"
}

mediumType: "photograph" for photos/photorealistic renders, "illustration" for paintings/drawings/digital painting, "3d-render" for CGI, "mixed" for both.

hexPalette: Up to 5 colors from actual surfaces. Include range (dark, midtone, light/accent). Darkest → lightest. Empty array if unremarkable.

visualKeywords: 6-10 items, 2-6 words each. Focus on CREATIVE INTENT and TECHNICAL QUALITIES:
- For photos: "85mm portrait compression", "single-source window light", "editorial jewelry campaign", "shallow depth subject isolation", "warm-cool color tension"
- For illustrations: "loose wet-on-wet technique", "limited earth-tone palette", "hand-painted light gradients", "visible paper texture"

Return ONLY valid JSON, nothing else.`
