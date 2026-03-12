# PromptEnhancer

Generate cinematic [Flux 2 \[pro\]](https://blackforestlabs.ai/) image prompts from reference images and concept descriptions. Upload a moodboard, describe a vibe, and get production-ready prompts written like a senior Director of Photography.

![Next.js](https://img.shields.io/badge/Next.js-16-black) ![TypeScript](https://img.shields.io/badge/TypeScript-5-blue) ![Tailwind](https://img.shields.io/badge/Tailwind-4-38bdf8)

---

## What it does

PromptEnhancer runs a two-step AI pipeline via [OpenRouter](https://openrouter.ai):

1. **Visual analysis** — Upload reference images and Gemini 2.5 Flash extracts abstract aesthetic properties: colour palette, light quality, compositional energy, atmosphere, cinematic style. Subjects, faces, and locations are deliberately ignored — only the *feel* is captured.
2. **Prompt generation** — MiniMax M2.5 writes 3–6 Flux 2 [pro] prompts in the voice of a senior Director of Photography. Think Denis Villeneuve's restraint, Roger Deakins' mastery of practical light, David Lynch's quiet wrongness. Each prompt is 70–120 words, specifies a lens, depth of field, lighting quality, and a distinct camera angle.

Results appear as cards. Hover any card to **Copy** or **Revise** it — the revision panel lets you describe what should change ("make it warmer", "shift to dusk", "add rain") and rewrites only that prompt in-place.

---

## Quick start

### Prerequisites

- [Node.js](https://nodejs.org) (v18 or later)
- An [OpenRouter](https://openrouter.ai) API key (both models used are available on the free tier)

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

**macOS / Linux** — double-click or run from terminal:

```bash
./start.sh
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

1. **Add reference images** (optional) — drag and drop, click to browse, paste from clipboard, or enter a URL. Up to 10 images, max 10 MB each. Images are compressed client-side before sending.
2. **Describe your concept** (optional) — fill in any combination of Storyline, Subject, Environment, and Mood. All fields are optional; you can use images alone, text alone, or both.
3. **Choose a prompt count** — 3, 4, 5, or 6 prompts.
4. **Generate** — the pipeline runs server-side. With images, expect ~15–30 seconds for the vision step plus generation. Text-only is faster.
5. **Revise** — hover any result card, click Revise, describe what should change, and Apply. Only that card updates.

---

## Stack

| Layer | Tech |
|---|---|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript 5 |
| Styling | Tailwind CSS 4 |
| AI Gateway | [OpenRouter](https://openrouter.ai) |
| Vision model | `google/gemini-2.5-flash` |
| Text model | `minimax/minimax-m2.5` |

No database. No auth. No extra npm packages beyond the Next.js scaffold.

---

## Project structure

```
src/
  app/
    page.tsx                  # Main page — state, generate + update handlers
    layout.tsx                # Root layout
    globals.css               # Global styles
    api/
      generate/route.ts       # Two-step pipeline: Gemini vision → MiniMax generation
      revise/route.ts         # Single-card revision: MiniMax rewrite
  components/
    ApiKeyInput.tsx           # Optional client-side API key input
    ImageUploader.tsx         # Drag-drop, paste, URL input
    InputForm.tsx             # Storyline / Subject / Environment / Mood fields
    PromptList.tsx            # Revision orchestration, visual style panel
    PromptCard.tsx            # Prompt display, copy, inline revise UI
  lib/
    openrouter.ts             # Typed fetch wrapper + JSON parser
    system-prompt.ts          # All prompt builders and shared types
    image-utils.ts            # Canvas resize/compress, clipboard, URL validation
```

---

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `OPENROUTER_API_KEY` | Yes | Your [OpenRouter](https://openrouter.ai) API key — stored server-side only |

---

## License

MIT
