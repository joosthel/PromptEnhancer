'use client'

import { UserInputs } from '@/lib/system-prompt'
import { GenerationMode, GENERATION_MODES } from '@/lib/model-profiles'

interface InputFormProps {
  values: UserInputs
  promptCount: number
  activeMode: GenerationMode
  enhanceMode: boolean
  onChange: (values: UserInputs) => void
  onPromptCountChange: (count: number) => void
  onModeChange: (mode: GenerationMode) => void
  onEnhanceModeChange: (enhance: boolean) => void
}

const PROMPT_COUNTS = [3, 4, 5, 6]

const PLACEHOLDERS: Record<GenerationMode, string> = {
  generate:
    'Describe your scene — subject, environment, mood, lighting, camera angle. The more specific you are, the better the prompts.\n\nExample: A woman in her 30s stands on a rain-slicked Tokyo rooftop at night. Neon signs reflect off wet concrete. Tense, melancholic. Cold blue light with warm neon spill.',
  edit:
    'Describe what you want the final image to look like, or what should change.\n\nExample: Replace the background with a sunset beach. Keep the subject and their pose exactly as they are. Warm golden light washing over the scene.',
  video:
    'Describe the motion, camera movement, and what happens over time.\n\nExample: Camera slowly dollies in on a woman sitting at a cafe table. She looks up from her coffee, turns toward the window. Outside, rain begins to fall. Ambient cafe sounds, soft piano.',
}

const ENHANCE_PLACEHOLDER =
  'Paste your prompt here. It will be restructured, expanded with specificity, and optimized for the selected model.\n\nExample: beautiful woman standing in golden light, cinematic, moody, detailed skin'

export default function InputForm({
  values,
  promptCount,
  activeMode,
  enhanceMode,
  onChange,
  onPromptCountChange,
  onModeChange,
  onEnhanceModeChange,
}: InputFormProps) {
  return (
    <div className="space-y-5">
      {/* Mode toggle */}
      <div>
        <label className="block text-xs uppercase tracking-widest text-neutral-400 mb-2">
          Mode
        </label>
        <div className="flex gap-1.5">
          {GENERATION_MODES.map((mode) => (
            <button
              key={mode.id}
              onClick={() => onModeChange(mode.id)}
              className={`text-xs px-3 py-1.5 rounded-sm transition-all ${
                activeMode === mode.id && !enhanceMode
                  ? 'bg-neutral-900 text-white'
                  : 'bg-white text-neutral-500 border border-neutral-200 hover:border-neutral-400'
              }`}
            >
              {mode.label}
            </button>
          ))}
          <div className="w-px bg-neutral-200 mx-0.5" />
          <button
            onClick={() => onEnhanceModeChange(!enhanceMode)}
            className={`text-xs px-3 py-1.5 rounded-sm transition-all ${
              enhanceMode
                ? 'bg-neutral-900 text-white'
                : 'bg-white text-neutral-500 border border-neutral-200 hover:border-neutral-400'
            }`}
          >
            Enhance
          </button>
        </div>
      </div>

      {/* Description / prompt textarea */}
      <div>
        <label className="block text-xs uppercase tracking-widest text-neutral-400 mb-2">
          {enhanceMode ? 'Prompt to Enhance' : 'Description'}
        </label>
        <textarea
          value={values.description}
          onChange={(e) => onChange({ description: e.target.value })}
          placeholder={enhanceMode ? ENHANCE_PLACEHOLDER : PLACEHOLDERS[activeMode]}
          rows={enhanceMode ? 4 : 5}
          className="w-full border border-neutral-200 rounded-sm px-3 py-2 text-sm bg-white focus:outline-none focus:border-neutral-400 resize-none placeholder:text-neutral-300"
        />
      </div>

      {/* Prompt count — hidden in enhance mode */}
      {!enhanceMode && (
        <div>
          <label className="block text-xs uppercase tracking-widest text-neutral-400 mb-2">
            Number of Prompts
          </label>
          <div className="flex gap-2">
            {PROMPT_COUNTS.map((count) => (
              <button
                key={count}
                onClick={() => onPromptCountChange(count)}
                className={`w-10 h-8 text-sm rounded-sm border transition-all ${
                  promptCount === count
                    ? 'bg-neutral-900 text-white border-neutral-900'
                    : 'bg-white text-neutral-500 border-neutral-200 hover:border-neutral-400'
                }`}
              >
                {count}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
