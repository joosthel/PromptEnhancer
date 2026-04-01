'use client'

import { useState } from 'react'
import { FIX_CATEGORIES } from '@/lib/model-profiles'

interface FixToolbarProps {
  onFix: (fixCategory: string, customNote?: string) => void
  isFixing: boolean
}

export default function FixToolbar({ onFix, isFixing }: FixToolbarProps) {
  const [customText, setCustomText] = useState('')

  function handleCustomSubmit() {
    const text = customText.trim()
    if (!text) return
    onFix('custom', text)
    setCustomText('')
  }

  return (
    <div className="border-t border-neutral-100 pt-3 mt-3 space-y-2">
      <div className={`flex flex-wrap gap-1.5 ${isFixing ? 'opacity-40 cursor-not-allowed pointer-events-none' : ''}`}>
        {FIX_CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            onClick={() => onFix(cat.id)}
            className="text-xs px-2 py-0.5 rounded-sm border border-neutral-200 text-neutral-500 hover:border-neutral-400 hover:text-neutral-700 transition-all cursor-pointer"
          >
            {cat.label}
          </button>
        ))}
      </div>

      <div className="flex gap-1.5">
        <input
          type="text"
          value={customText}
          onChange={(e) => setCustomText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleCustomSubmit()
          }}
          placeholder="Or describe: make it warmer, add rain, shift to dusk..."
          disabled={isFixing}
          className="flex-1 border border-neutral-200 rounded-sm px-2.5 py-1 text-xs bg-white focus:outline-none focus:border-neutral-400 placeholder:text-neutral-400 disabled:opacity-40"
        />
        <button
          onClick={handleCustomSubmit}
          disabled={isFixing || !customText.trim()}
          className="text-xs px-2 py-1 bg-neutral-900 text-white rounded-sm hover:bg-neutral-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Fix
        </button>
      </div>
    </div>
  )
}
