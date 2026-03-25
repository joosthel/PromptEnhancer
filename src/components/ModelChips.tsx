'use client'

import { TargetModel, MODEL_PROFILES } from '@/lib/model-profiles'

interface ModelChipsProps {
  activeModel: TargetModel
  availableModels: TargetModel[]
  loadingModel: TargetModel | null
  onModelClick: (model: TargetModel) => void
}

export default function ModelChips({ activeModel, availableModels, loadingModel, onModelClick }: ModelChipsProps) {
  return (
    <div className="flex items-center gap-1">
      {availableModels.map((modelId) => {
        const profile = MODEL_PROFILES[modelId]
        const isActive = activeModel === modelId
        const isLoading = loadingModel === modelId

        return (
          <button
            key={modelId}
            onClick={() => onModelClick(modelId)}
            title={profile.label}
            disabled={isLoading}
            className={`px-1.5 py-0.5 rounded-sm font-mono transition-all ${
              isLoading
                ? 'animate-pulse bg-neutral-200 text-neutral-400 text-[10px]'
                : isActive
                  ? 'bg-neutral-900 text-white text-[10px]'
                  : 'bg-white text-neutral-400 text-[10px] border border-neutral-200 hover:border-neutral-400 hover:text-neutral-600'
            }`}
          >
            {profile.shortLabel}
          </button>
        )
      })}
    </div>
  )
}
