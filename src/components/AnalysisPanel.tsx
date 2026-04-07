'use client'

import { useState } from 'react'
import { VisualStyleCues } from '@/lib/system-prompt'

interface AnalysisPanelProps {
  cues: VisualStyleCues
  defaultOpen?: boolean
}

export default function AnalysisPanel({ cues, defaultOpen = false }: AnalysisPanelProps) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="border border-neutral-200 rounded-sm">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <span className="text-xs uppercase tracking-widest text-neutral-400">
          Visual Analysis
        </span>
        <span className="text-neutral-400 text-sm">{open ? '\u2212' : '+'}</span>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-4 border-t border-neutral-100">
          {cues.hexPalette?.length > 0 && (
            <div className="flex items-center gap-3 pt-3">
              <div className="flex gap-1.5">
                {cues.hexPalette.map((hex, i) => (
                  <div
                    key={i}
                    title={hex}
                    className="w-5 h-5 rounded-sm border border-neutral-200 flex-shrink-0"
                    style={{ backgroundColor: hex }}
                  />
                ))}
              </div>
              <span className="text-[10px] text-neutral-400 font-mono">
                {cues.hexPalette.join(' · ')}
              </span>
            </div>
          )}
          {cues.cinematicKeywords?.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {cues.cinematicKeywords.map((kw, i) => (
                <span
                  key={i}
                  className="text-xs px-2 py-0.5 bg-neutral-100 text-neutral-500 rounded-sm font-mono"
                >
                  {kw}
                </span>
              ))}
            </div>
          )}
          {cues.atmosphere && (
            <p className="text-[11px] text-neutral-500 italic border-l-2 border-neutral-200 pl-2">
              {cues.atmosphere}
            </p>
          )}
          <p className="text-xs text-neutral-600 leading-relaxed whitespace-pre-line break-words">
            {cues.description}
          </p>
        </div>
      )}
    </div>
  )
}
