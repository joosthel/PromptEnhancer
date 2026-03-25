'use client'

import { TargetModel, MODEL_PROFILES, IMAGE_MODELS, VIDEO_MODELS } from '@/lib/model-profiles'

interface ModelBarProps {
  activeModel: TargetModel
  onChange: (model: TargetModel) => void
}

export default function ModelBar({ activeModel, onChange }: ModelBarProps) {
  return (
    <div className="flex items-center gap-1.5">
      {IMAGE_MODELS.map((m) => (
        <button
          key={m.id}
          onClick={() => onChange(m.id)}
          title={m.label}
          className={`text-xs px-2.5 py-1 rounded-sm transition-all ${
            activeModel === m.id
              ? 'bg-neutral-900 text-white'
              : 'bg-white text-neutral-500 border border-neutral-200 hover:border-neutral-400'
          }`}
        >
          {m.shortLabel}
        </button>
      ))}

      <div className="w-px h-5 bg-neutral-200 mx-1" />

      {VIDEO_MODELS.map((m) => (
        <button
          key={m.id}
          onClick={() => onChange(m.id)}
          title={m.label}
          className={`text-xs px-2.5 py-1 rounded-sm transition-all ${
            activeModel === m.id
              ? 'bg-neutral-900 text-white'
              : 'bg-white text-neutral-500 border border-neutral-200 hover:border-neutral-400'
          }`}
        >
          {m.shortLabel}
        </button>
      ))}
    </div>
  )
}
