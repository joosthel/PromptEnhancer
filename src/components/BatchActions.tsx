'use client'

import { useState } from 'react'

const BATCH_FIX_PRESETS = [
  { id: 'hands', label: 'Hands' },
  { id: 'lighting', label: 'Lighting' },
  { id: 'too-ai', label: 'Too AI' },
  { id: 'mood', label: 'Mood' },
]

interface BatchActionsProps {
  totalCount: number
  selectedCount: number
  onSelectAll: () => void
  onDeselectAll: () => void
  onBatchFix: (fixCategory: string) => void
  isBatchFixing: boolean
}

export default function BatchActions({
  totalCount,
  selectedCount,
  onSelectAll,
  onDeselectAll,
  onBatchFix,
  isBatchFixing,
}: BatchActionsProps) {
  const [customOpen, setCustomOpen] = useState(false)
  const [customText, setCustomText] = useState('')

  if (totalCount === 0) return null

  const allSelected = selectedCount === totalCount
  const hasSelection = selectedCount > 0
  const chipsDisabled = !hasSelection || isBatchFixing

  function handleCustomSubmit() {
    const text = customText.trim()
    if (!text) return
    onBatchFix('custom:' + text)
    setCustomText('')
    setCustomOpen(false)
  }

  return (
    <div className="flex items-center justify-between border-b border-neutral-100 pb-3 mb-4">
      <div className="flex items-center gap-3">
        <button
          onClick={allSelected ? onDeselectAll : onSelectAll}
          className="text-xs text-neutral-500 hover:text-neutral-700 transition-colors"
        >
          {allSelected ? 'Deselect All' : 'Select All'}
        </button>
        <span className="text-xs text-neutral-400">
          ({selectedCount} of {totalCount} selected)
        </span>
      </div>

      <div className="flex items-center gap-1.5">
        <div className={`flex items-center gap-1.5 ${chipsDisabled ? 'opacity-40 pointer-events-none' : ''}`}>
          {BATCH_FIX_PRESETS.map((preset) => (
            <button
              key={preset.id}
              onClick={() => onBatchFix(preset.id)}
              className="text-xs px-2 py-0.5 rounded-sm border border-neutral-200 text-neutral-500 hover:border-neutral-400 hover:text-neutral-700 transition-all cursor-pointer"
            >
              {preset.label}
            </button>
          ))}
          <button
            onClick={() => setCustomOpen(!customOpen)}
            className="text-xs px-2 py-0.5 rounded-sm border border-neutral-200 text-neutral-500 hover:border-neutral-400 hover:text-neutral-700 transition-all cursor-pointer"
          >
            Custom...
          </button>
        </div>

        {customOpen && hasSelection && (
          <div className="flex gap-1.5 ml-1.5">
            <input
              type="text"
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCustomSubmit()
              }}
              placeholder="Describe fix..."
              disabled={isBatchFixing}
              className="border border-neutral-200 rounded-sm px-2 py-0.5 text-xs bg-white focus:outline-none focus:border-neutral-400 placeholder:text-neutral-300 disabled:opacity-40 w-40"
            />
            <button
              onClick={handleCustomSubmit}
              disabled={isBatchFixing || !customText.trim()}
              className="text-xs px-2 py-0.5 bg-neutral-900 text-white rounded-sm hover:bg-neutral-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Fix
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
