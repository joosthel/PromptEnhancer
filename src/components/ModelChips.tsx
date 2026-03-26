'use client'

import { TargetModel, GenerationMode, getModelsForMode } from '@/lib/model-profiles'

interface ModelChipsProps {
  activeModel: TargetModel
  activeMode: GenerationMode
  loadingModel: TargetModel | null
  onModelClick: (model: TargetModel) => void
}

export default function ModelChips({ activeModel, activeMode, loadingModel, onModelClick }: ModelChipsProps) {
  const models = getModelsForMode(activeMode)

  return (
    <div className="flex items-center gap-1">
      {models.map((m) => {
        const isActive = activeModel === m.id
        const isLoading = loadingModel === m.id

        return (
          <button
            key={m.id}
            onClick={() => onModelClick(m.id)}
            disabled={isLoading}
            className={`px-1.5 py-0.5 rounded-sm font-mono transition-all ${
              isLoading
                ? 'animate-pulse bg-neutral-200 text-neutral-400 text-[10px]'
                : isActive
                  ? 'bg-neutral-900 text-white text-[10px]'
                  : 'bg-white text-neutral-400 text-[10px] border border-neutral-200 hover:border-neutral-400 hover:text-neutral-600'
            }`}
          >
            {m.label}
          </button>
        )
      })}
    </div>
  )
}
