# PromptEnhancer

Generate cinematic Flux 2 [pro] image prompts from reference images and concept descriptions. Built with Next.js 14, powered by OpenRouter.

![Next.js](https://img.shields.io/badge/Next.js-14-black) ![TypeScript](https://img.shields.io/badge/TypeScript-5-blue) ![Tailwind](https://img.shields.io/badge/Tailwind-3-38bdf8)

---

## What it does

PromptEnhancer runs a two-step AI pipeline:

1. **Visual analysis** — Upload reference images and Gemini 2.5 Flash extracts abstract aesthetic properties: colour palette, light quality, compositional energy, atmosphere, cinematic style. Subjects, faces, and locations are deliberately ignored — only the *feel* is captured.
2. **Prompt generation** — MiniMax M2.5 writes 3–6 Flux 2 [pro] prompts in the voice of a senior Director of Photography. Think Denis Villeneuve's restraint, Roger Deakins' mastery of practical light, David Lynch's quiet wrongness. Each prompt is 70–120 words, specifies a lens, depth of field, lighting quality, and a distinct camera angle.

Results appear as cards. Hover any card to **Copy** or **Revise** it — the revision panel lets you describe what should change ("make it warmer", "shift to dusk", "add rain") and rewrites only that prompt in-place.

---

## Stack

| Layer | Tech |
|---|---|
| Framework | Next.js 14 App Router |
| Language | TypeScript |
| Styling | Tailwind CSS |
| AI Gateway | [OpenRouter](https://openrouter.ai) |
| Vision model | `google/gemini-2.5-flash` |
| Text model | `minimax/minimax-m2.5` |

No database. No auth. No extra npm packages beyond the Next.js scaffold.

---

## Getting started

### 1. Get an OpenRouter API key

Sign up at [openrouter.ai](https://openrouter.ai) and create an API key. Both models used here are available on the free tier with rate limits, or pay-as-you-go.

### 2. Clone and install

```bash
git clone https://github.com/YOUR_USERNAME/PromptEnhancer.git
cd PromptEnhancer
npm install
```

### 3. Add your API key

Create a `.env.local` file (never committed):

```bash
OPENROUTER_API_KEY=sk-or-v1-...
```

### 4. Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Usage

1. **Add reference images** (optional) — drag and drop, click to browse, paste from clipboard, or enter a URL. Up to 5 images, max 10 MB each. Images are compressed client-side before sending.
2. **Describe your concept** (optional) — fill in any combination of Storyline, Subject, Environment, and Mood. All fields are optional; you can use images alone, text alone, or both.
3. **Choose a prompt count** — 3, 4, 5, or 6 prompts.
4. **Generate** — the pipeline runs server-side. With images, expect ~15–30 seconds for the vision step plus generation. Text-only is faster.
5. **Revise** — hover any result card, click Revise, describe what should change, and Apply. Only that card updates.

---

## Project structure

```
src/
  app/
    page.tsx                 # Main page — state, generate + update handlers
    api/
      generate/route.ts      # Two-step pipeline: Gemini vision → MiniMax generation
      revise/route.ts        # Single-card revision: MiniMax rewrite
  components/
    ImageUploader.tsx        # Drag-drop, paste, URL input
    InputForm.tsx            # Storyline / Subject / Environment / Mood fields
    PromptList.tsx           # Revision orchestration, visual style panel
    PromptCard.tsx           # Prompt display, copy, inline revise UI
  lib/
    openrouter.ts            # Typed fetch wrapper + JSON parser
    system-prompt.ts         # All prompt builders and shared types
    image-utils.ts           # Canvas resize/compress, clipboard, URL validation
```

---

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `OPENROUTER_API_KEY` | Yes | Your OpenRouter API key — never expose client-side |

---

## License

MIT
