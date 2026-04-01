'use client'

import { UserInputs } from '@/lib/system-prompt'
import { AppMode, GenerationMode } from '@/lib/model-profiles'

interface InputFormProps {
  values: UserInputs
  promptCount: number
  appMode: AppMode
  generationSubMode: GenerationMode
  onChange: (values: UserInputs) => void
  onPromptCountChange: (count: number) => void
}

const PROMPT_COUNTS = [1, 2, 3, 4, 5, 6]

const PLACEHOLDERS: Record<GenerationMode, string> = {
  generate:
    'Describe your scene: subject, environment, mood, lighting.\ne.g. A woman on a rain-slicked Tokyo rooftop at night, neon reflections, melancholic.',
  edit:
    'Describe the result you want.\ne.g. Replace the background with a sunset beach. Keep the subject unchanged.',
  video:
    'Describe motion and camera movement over time.\ne.g. Camera dollies in on a woman at a cafe. She looks up, rain begins outside.',
}

const ENHANCE_PLACEHOLDERS: Record<GenerationMode, string> = {
  generate:
    'Paste your prompt here to optimize for the selected model.\ne.g. beautiful woman in golden light, cinematic, moody',
  edit:
    'Paste your edit prompt here. Upload reference images for context.\ne.g. Replace the background with a moody warehouse. Keep the subject.',
  video:
    'Paste your video prompt to optimize for the selected model.\ne.g. Camera dollies in on woman at cafe, she looks up, rain begins',
}

const ARTDIRECTION_PLACEHOLDER =
  'Describe the visual narrative and mood you want to develop.\ne.g. Fashion editorial in an abandoned greenhouse. Nature reclaiming high fashion.'

export default function InputForm({
  values,
  promptCount,
  appMode,
  generationSubMode,
  onChange,
  onPromptCountChange,
}: InputFormProps) {
  const placeholder = appMode === 'enhance'
    ? ENHANCE_PLACEHOLDERS[generationSubMode]
    : appMode === 'artdirection'
      ? ARTDIRECTION_PLACEHOLDER
      : PLACEHOLDERS[generationSubMode]

  const label = appMode === 'enhance'
    ? generationSubMode === 'edit' ? 'Edit Prompt to Enhance' : generationSubMode === 'video' ? 'Video Prompt to Enhance' : 'Prompt to Enhance'
    : appMode === 'artdirection'
      ? 'Creative Direction'
      : 'Description'

  return (
    <div className="space-y-5">
      <div>
        <label className="block text-xs uppercase tracking-widest text-neutral-400 mb-2">
          {label}
        </label>
        <textarea
          value={values.description}
          onChange={(e) => onChange({ description: e.target.value })}
          placeholder={placeholder}
          rows={appMode === 'enhance' ? 4 : 5}
          className="w-full border border-neutral-200 rounded-sm px-3 py-2 text-sm bg-white focus:outline-none focus:border-neutral-400 resize-none placeholder:text-neutral-400"
        />
      </div>

      {appMode !== 'enhance' && (
        <div>
          <label className="block text-xs uppercase tracking-widest text-neutral-400 mb-2">
            {appMode === 'artdirection' ? 'Number of Shot Cards' : 'Number of Prompts'}
          </label>
          <div className="flex gap-2">
            {PROMPT_COUNTS.map((count) => (
              <button
                key={count}
                onClick={() => onPromptCountChange(count)}
                className={`w-11 h-11 text-sm rounded-sm border transition-all ${
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
