'use client'

import { UserInputs } from '@/lib/system-prompt'

interface InputFormProps {
  values: UserInputs
  promptCount: number
  onChange: (values: UserInputs) => void
  onPromptCountChange: (count: number) => void
}

const PROMPT_COUNTS = [3, 4, 5, 6]

export default function InputForm({
  values,
  promptCount,
  onChange,
  onPromptCountChange,
}: InputFormProps) {
  function update(field: keyof UserInputs, value: string) {
    onChange({ ...values, [field]: value })
  }

  return (
    <div className="space-y-5">
      <div>
        <label className="block text-xs uppercase tracking-widest text-neutral-400 mb-2">
          Storyline / Concept
        </label>
        <textarea
          value={values.storyline}
          onChange={(e) => update('storyline', e.target.value)}
          placeholder="A lone detective searches an abandoned warehouse at night. Tension builds as shadows move..."
          rows={3}
          className="w-full border border-neutral-200 rounded-sm px-3 py-2 text-sm bg-white focus:outline-none focus:border-neutral-400 resize-none placeholder:text-neutral-300"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs uppercase tracking-widest text-neutral-400 mb-2">
            Subject
          </label>
          <input
            type="text"
            value={values.subject}
            onChange={(e) => update('subject', e.target.value)}
            placeholder="woman in her 30s, black coat"
            className="w-full border border-neutral-200 rounded-sm px-3 py-2 text-sm bg-white focus:outline-none focus:border-neutral-400 placeholder:text-neutral-300"
          />
        </div>
        <div>
          <label className="block text-xs uppercase tracking-widest text-neutral-400 mb-2">
            Environment
          </label>
          <input
            type="text"
            value={values.environment}
            onChange={(e) => update('environment', e.target.value)}
            placeholder="urban rooftop, rain-slicked streets"
            className="w-full border border-neutral-200 rounded-sm px-3 py-2 text-sm bg-white focus:outline-none focus:border-neutral-400 placeholder:text-neutral-300"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs uppercase tracking-widest text-neutral-400 mb-2">
          Mood / Feeling
        </label>
        <input
          type="text"
          value={values.mood}
          onChange={(e) => update('mood', e.target.value)}
          placeholder="tense, melancholic, cold blue light"
          className="w-full border border-neutral-200 rounded-sm px-3 py-2 text-sm bg-white focus:outline-none focus:border-neutral-400 placeholder:text-neutral-300"
        />
      </div>

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
    </div>
  )
}
