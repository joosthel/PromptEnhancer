'use client'

import { TargetModel, AppMode, GenerationMode, getModelsForAppMode } from '@/lib/model-profiles'

interface ModelSelectorProps {
  activeModel: TargetModel
  appMode: AppMode
  generationSubMode: GenerationMode
  onChange: (model: TargetModel) => void
}

export default function ModelSelector({
  activeModel,
  appMode,
  generationSubMode,
  onChange,
}: ModelSelectorProps) {
  const models = getModelsForAppMode(appMode, generationSubMode)

  return (
    <div className="space-y-2">
      <label className="block text-xs uppercase tracking-widest text-neutral-400">
        Target Model
      </label>
      <div className="space-y-1.5">
        {models.map((m) => (
          <button
            key={m.id}
            onClick={() => onChange(m.id)}
            className={`w-full text-left px-3 py-2 rounded-sm transition-all ${
              activeModel === m.id
                ? 'bg-neutral-900 text-white'
                : 'bg-white text-neutral-700 border border-neutral-200 hover:border-neutral-400'
            }`}
          >
            <div className="text-sm font-medium">{m.label}</div>
            <div className={`text-xs mt-0.5 break-words ${
              activeModel === m.id ? 'text-neutral-400' : 'text-neutral-500'
            }`}>
              {m.description}
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
