'use client'

import { useState } from 'react'

interface FixHistoryProps {
  history: Array<{ prompt: string; fix: string; timestamp: number }>
  onRestore: (index: number) => void
}

export default function FixHistory({ history, onRestore }: FixHistoryProps) {
  const [expanded, setExpanded] = useState(false)

  if (history.length === 0) return null

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="text-[10px] font-mono text-neutral-400 hover:text-neutral-600 transition-colors"
      >
        [{history.length} {history.length === 1 ? 'fix' : 'fixes'}]
      </button>
    )
  }

  return (
    <div className="border-t border-neutral-100 pt-2 mt-2 space-y-1">
      <button
        onClick={() => setExpanded(false)}
        className="text-[10px] font-mono text-neutral-400 hover:text-neutral-600 transition-colors mb-1"
      >
        [{history.length} {history.length === 1 ? 'fix' : 'fixes'}]
      </button>

      {history.map((entry, i) => {
        const isLast = i === history.length - 1
        return (
          <div key={entry.timestamp} className="flex items-center gap-2">
            <span className="text-xs text-neutral-500 font-mono flex-shrink-0">v{i + 1}</span>
            <span className="text-xs text-neutral-500 truncate">{entry.fix}</span>
            {!isLast && (
              <button
                onClick={() => onRestore(i)}
                className="text-[10px] text-neutral-400 hover:text-neutral-700 border border-neutral-200 hover:border-neutral-400 px-1.5 py-0.5 rounded-sm transition-all flex-shrink-0"
              >
                Restore
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}
