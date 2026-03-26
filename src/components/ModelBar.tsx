'use client'

import { TargetModel, GenerationMode, getModelsForMode } from '@/lib/model-profiles'

interface ModelBarProps {
  activeModel: TargetModel
  activeMode: GenerationMode
  onChange: (model: TargetModel) => void
}

export default function ModelBar({ activeModel, activeMode, onChange }: ModelBarProps) {
  const models = getModelsForMode(activeMode)

  return (
    <div className="flex items-center gap-1.5">
      {models.map((m) => (
        <button
          key={m.id}
          onClick={() => onChange(m.id)}
          className={`text-xs px-2.5 py-1 rounded-sm transition-all ${
            activeModel === m.id
              ? 'bg-neutral-900 text-white'
              : 'bg-white text-neutral-500 border border-neutral-200 hover:border-neutral-400'
          }`}
        >
          {m.label}
        </button>
      ))}
    </div>
  )
}
