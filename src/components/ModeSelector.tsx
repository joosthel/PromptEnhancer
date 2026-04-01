'use client'

import { AppMode, APP_MODES, GenerationMode, GENERATION_MODES } from '@/lib/model-profiles'

interface ModeSelectorProps {
  appMode: AppMode
  generationSubMode: GenerationMode
  onAppModeChange: (mode: AppMode) => void
  onSubModeChange: (mode: GenerationMode) => void
}

export default function ModeSelector({
  appMode,
  generationSubMode,
  onAppModeChange,
  onSubModeChange,
}: ModeSelectorProps) {
  return (
    <div className="space-y-2">
      <label className="block text-xs uppercase tracking-widest text-neutral-400">
        Mode
      </label>
      <div className="space-y-1.5">
        {APP_MODES.map((mode) => (
          <button
            key={mode.id}
            onClick={() => onAppModeChange(mode.id)}
            className={`w-full text-left px-3 py-2.5 rounded-sm transition-all ${
              appMode === mode.id
                ? 'bg-neutral-900 text-white'
                : 'bg-white text-neutral-700 border border-neutral-200 hover:border-neutral-400'
            }`}
          >
            <div className="text-sm font-medium">{mode.label}</div>
            <div className={`text-xs mt-0.5 ${
              appMode === mode.id ? 'text-neutral-500' : 'text-neutral-400'
            }`}>
              {mode.tagline}
            </div>
          </button>
        ))}
      </div>

      {/* Sub-mode chips for Prompt Generation and Enhancement */}
      {(appMode === 'generate' || appMode === 'enhance') && (
        <div className="flex gap-1.5 pt-1">
          {GENERATION_MODES.map((mode) => (
            <button
              key={mode.id}
              onClick={() => onSubModeChange(mode.id)}
              className={`text-xs px-3 py-2 rounded-sm transition-all ${
                generationSubMode === mode.id
                  ? 'bg-neutral-700 text-white'
                  : 'bg-white text-neutral-500 border border-neutral-200 hover:border-neutral-400'
              }`}
            >
              {mode.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
