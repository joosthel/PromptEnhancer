'use client'

import { useState, useEffect } from 'react'

interface RegeneratePopupProps {
  open: boolean
  prompts: Array<{ label: string; prompt: string }>
  isLoading: boolean
  onRegenerate: (lockedIndices: Set<number>) => void
  onCancel: () => void
}

export default function RegeneratePopup({
  open,
  prompts,
  isLoading,
  onRegenerate,
  onCancel,
}: RegeneratePopupProps) {
  const [locked, setLocked] = useState<Set<number>>(new Set())

  // Reset locked state when popup opens
  useEffect(() => {
    if (open) setLocked(new Set())
  }, [open])

  useEffect(() => {
    if (!open) return
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [open, onCancel])

  if (!open) return null

  function toggleLock(index: number) {
    setLocked(prev => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  function lockAll() {
    setLocked(new Set(prompts.map((_, i) => i)))
  }

  function unlockAll() {
    setLocked(new Set())
  }

  const unlockedCount = prompts.length - locked.size
  const allLocked = locked.size === prompts.length

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="regen-title"
        className="bg-white max-w-md w-full mx-4 rounded-sm shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 space-y-4">
          <div>
            <h2 id="regen-title" className="text-sm font-medium text-neutral-900">
              Regenerate Prompts
            </h2>
            <p className="text-xs text-neutral-400 mt-1">
              Lock the prompts you want to keep. Unlocked prompts will be regenerated with fresh variations.
            </p>
          </div>

          {/* Prompt list with lock toggles */}
          <div className="space-y-1.5 max-h-[320px] overflow-y-auto">
            {prompts.map((p, i) => {
              const isLocked = locked.has(i)
              return (
                <button
                  key={i}
                  onClick={() => toggleLock(i)}
                  className={`w-full text-left flex items-start gap-2.5 px-3 py-2.5 rounded-sm border transition-all ${
                    isLocked
                      ? 'border-neutral-300 bg-neutral-50'
                      : 'border-neutral-200 bg-white hover:border-neutral-300'
                  }`}
                >
                  <div className="flex items-center gap-2 shrink-0 pt-0.5">
                    <span className={`text-[10px] font-mono ${isLocked ? 'text-neutral-500' : 'text-neutral-300'}`}>
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <span className={`text-xs ${isLocked ? 'text-neutral-600' : 'text-neutral-300'}`}>
                      {isLocked ? '🔒' : '🔓'}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] uppercase tracking-widest text-neutral-400 mb-0.5">
                      {p.label}
                    </div>
                    <p className={`text-xs leading-relaxed line-clamp-2 ${
                      isLocked ? 'text-neutral-600' : 'text-neutral-400'
                    }`}>
                      {p.prompt}
                    </p>
                  </div>
                </button>
              )
            })}
          </div>

          {/* Quick actions */}
          <div className="flex items-center justify-between">
            <div className="flex gap-2">
              <button
                onClick={lockAll}
                className="text-[10px] uppercase tracking-wider text-neutral-400 hover:text-neutral-600 transition-colors"
              >
                Lock all
              </button>
              <span className="text-neutral-200">·</span>
              <button
                onClick={unlockAll}
                className="text-[10px] uppercase tracking-wider text-neutral-400 hover:text-neutral-600 transition-colors"
              >
                Unlock all
              </button>
            </div>
            <span className="text-[10px] text-neutral-400">
              {unlockedCount} of {prompts.length} will regenerate
            </span>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <button
              onClick={onCancel}
              className="flex-1 py-2.5 text-sm text-neutral-600 border border-neutral-200 rounded-sm hover:border-neutral-300 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => onRegenerate(locked)}
              disabled={allLocked || isLoading}
              className="flex-1 py-2.5 text-sm bg-neutral-900 text-white rounded-sm hover:bg-neutral-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Regenerating...' : `Regenerate ${unlockedCount} prompt${unlockedCount !== 1 ? 's' : ''}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
