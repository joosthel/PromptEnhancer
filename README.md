# PromptEnhancer

AI prompt engineering for image and video production. By [Joost Helfers](https://joosthelfers.com/).

![Next.js](https://img.shields.io/badge/Next.js-16-black) ![TypeScript](https://img.shields.io/badge/TypeScript-5-blue) ![Tailwind](https://img.shields.io/badge/Tailwind-4-38bdf8)

---

## What it does

PromptEnhancer generates model-optimized prompts for commercial AI image and video production. It runs a three-step pipeline via [OpenRouter](https://openrouter.ai):

1. **Vision Analysis** — An AI vision model reads your reference images and extracts color palette, lighting, texture, and emotional tone.
2. **Creative Brief** — A planning model develops a production brief: creative vision, visual metaphor, shot diversity, and color anchors.
3. **Prompt Derivation** — Prompts are derived from the brief, formatted for the target model's specific strengths and syntax.

### Three modes

- **Prompt Enhancement** — Paste an existing prompt and optimize it for a specific model. The enhancer restructures, expands, and adapts your prompt.
- **Prompt Generation** — The full pipeline. Upload reference images, describe your concept, and generate diverse model-specific prompts. Supports Generate (text-to-image), Edit (image-to-image), and Video sub-modes.
- **Art Direction** — Develop creative briefs and visual narratives without generating final prompts. Get a creative vision, visual metaphor, shot diversity matrix, and color anchors.

### Supported models

| Model | Type | Description |
|---|---|---|
| **Flux 2 Klein 9B** | Image | Best for cinematic stills. Keep prompts concise (50-100 words). |
| **NanoBanana 2** | Image | Fast and flexible. Up to 14 reference images with character consistency. |
| **Veo 3.1** | Video | Google video. Structured scenes with camera, dialogue, and audio. |
| **Kling v3** | Video | Multi-shot video with character labels and temporal markers. |
| **Kling o3** | Video | Enhanced Kling with deeper scene understanding for complex sequences. |
| **LTX-Video 2.3** | Video | High-resolution video (up to 4K). Flowing present-tense with audio. |

---

## Quick start

### Prerequisites

- [Node.js](https://nodejs.org) (v18 or later)
- An [OpenRouter](https://openrouter.ai) API key

### 1. Clone and install

```bash
git clone https://github.com/joosthel/PromptEnhancer.git
cd PromptEnhancer
npm install
```

### 2. Add your API key

Create a `.env.local` file in the project root:

```bash
echo 'OPENROUTER_API_KEY=sk-or-v1-...' > .env.local
```

Replace `sk-or-v1-...` with your actual key from [openrouter.ai/keys](https://openrouter.ai/keys).

### 3. Run

**macOS** — double-click `start.command`, or run from terminal:

```bash
./start.command
```

**Windows** — double-click `start.bat`, or from a terminal:

```cmd
start.bat
```

Both scripts install dependencies (if needed), check for your API key, start the dev server, and open your browser at [http://localhost:3000](http://localhost:3000).

You can also start manually:

```bash
npm run dev
```

---

## Usage

1. **Choose a mode** — Select Prompt Enhancement, Prompt Generation, or Art Direction from the left panel.
2. **Select a target model** — Pick the AI model you're generating prompts for.
3. **Add reference images** (optional) — Drag and drop, click to browse, paste from clipboard, or enter a URL. Click thumbnails to label images (style reference, subject, face, background).
4. **Describe your concept** — Fill in the text area. All modes accept freeform descriptions.
5. **Set prompt count** (Generation/Art Direction) — Choose 1-6 prompts for diversity.
6. **Generate** — The pipeline runs server-side. Reference images are cached, so re-generating with the same images skips the vision step.
7. **Refine** — Use Fix buttons on individual prompt cards to iterate without re-running the full pipeline (Hands, Lighting, Too AI, Mood, or custom notes).

---

## Stack

| Layer | Tech |
|---|---|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript 5 |
| Styling | Tailwind CSS 4 |
| AI Gateway | [OpenRouter](https://openrouter.ai) |
| Vision model | `google/gemini-2.5-flash` |
| Planning model | `deepseek/deepseek-v3.2` |

No database. No auth. No extra npm packages beyond the Next.js scaffold.

---

## Project structure

```
src/
  app/
    page.tsx                  # Main page — state, mode logic, generation handlers
    layout.tsx                # Root layout, metadata, fonts
    globals.css               # Global styles, accessibility rules
    api/
      generate/route.ts       # Three-step pipeline: vision → brief → prompts
      enhance/route.ts        # Single-step prompt enhancement
      fix/route.ts            # Single-card fix/revision
      reformat/route.ts       # Cross-model prompt reformatting
  components/
    ModeSelector.tsx          # Three app modes + sub-mode chips
    ModelSelector.tsx         # Target model cards with descriptions
    ImageUploader.tsx         # Drag-drop, paste, URL input, image labeling
    InputForm.tsx             # Description textarea + prompt count
    PromptList.tsx            # Results: brief, visual analysis, prompt cards
    PromptCard.tsx            # Individual prompt with copy, fix, reformat
    FixToolbar.tsx            # Fix category chips + custom input
    FixHistory.tsx            # Prompt revision history
    ModelChips.tsx            # Cross-model reformat chips per card
    BatchActions.tsx          # Select all, batch fix operations
    LoadingAnimation.tsx      # Dot-ring loading with phase labels
    CreditPopup.tsx           # API credit acknowledgment popup
    HelpModal.tsx             # How-it-works documentation modal
  lib/
    openrouter.ts             # Typed fetch wrapper for OpenRouter API
    system-prompt.ts          # Vision prompt, types, shared constants
    prompt-engine.ts          # System prompt + user message builders
    model-profiles.ts         # Model definitions, modes, fix categories
    image-utils.ts            # Canvas resize, clipboard, URL validation, fingerprinting
    use-focus-trap.ts         # Shared focus trap hook for modals
```

---

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `OPENROUTER_API_KEY` | Yes | Your [OpenRouter](https://openrouter.ai) API key — stored server-side only |
| `NEXT_PUBLIC_SITE_URL` | No | Production URL (defaults to `http://localhost:3000`) |

---

## License

MIT
