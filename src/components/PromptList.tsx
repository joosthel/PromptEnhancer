'use client'

import { useState } from 'react'
import { VisualStyleCues } from '@/lib/system-prompt'
import PromptCard from './PromptCard'

interface PromptListProps {
  prompts: Array<{ label: string; prompt: string }>
  visualStyleCues?: VisualStyleCues
}

export default function PromptList({ prompts, visualStyleCues }: PromptListProps) {
  const [showCues, setShowCues] = useState(false)

  return (
    <div className="space-y-6">
      {visualStyleCues && (
        <div className="border border-neutral-200 rounded-sm">
          <button
            onClick={() => setShowCues(!showCues)}
            className="w-full flex items-center justify-between px-4 py-3 text-left"
          >
            <span className="text-xs uppercase tracking-widest text-neutral-400">
              Visual Inspiration
            </span>
            <span className="text-neutral-400 text-sm">{showCues ? '−' : '+'}</span>
          </button>

          {showCues && (
            <div className="px-4 pb-4 space-y-3 border-t border-neutral-100">
              {visualStyleCues.hexPalette?.length > 0 && (
                <div className="flex items-center gap-3 pt-3">
                  <span className="text-xs text-neutral-400 w-20 flex-shrink-0">Palette</span>
                  <div className="flex gap-1.5">
                    {visualStyleCues.hexPalette.map((hex, i) => (
                      <div
                        key={i}
                        title={hex}
                        className="w-6 h-6 rounded-sm border border-neutral-200 flex-shrink-0"
                        style={{ backgroundColor: hex }}
                      />
                    ))}
                  </div>
                  <span className="text-xs text-neutral-400 font-mono">
                    {visualStyleCues.hexPalette.join(' · ')}
                  </span>
                </div>
              )}
              <div className="flex gap-3">
                <span className="text-xs text-neutral-400 w-20 flex-shrink-0 pt-0.5">Light</span>
                <span className="text-xs text-neutral-600">{visualStyleCues.lightQuality}</span>
              </div>
              <div className="flex gap-3">
                <span className="text-xs text-neutral-400 w-20 flex-shrink-0 pt-0.5">
                  Atmosphere
                </span>
                <span className="text-xs text-neutral-600">{visualStyleCues.atmosphere}</span>
              </div>
              <div className="flex gap-3">
                <span className="text-xs text-neutral-400 w-20 flex-shrink-0 pt-0.5">Style</span>
                <span className="text-xs text-neutral-600">{visualStyleCues.cinematicStyle}</span>
              </div>
              {visualStyleCues.colorMood && (
                <div className="flex gap-3">
                  <span className="text-xs text-neutral-400 w-20 flex-shrink-0 pt-0.5">
                    Color Mood
                  </span>
                  <span className="text-xs text-neutral-600">{visualStyleCues.colorMood}</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="space-y-3">
        {prompts.map((p, i) => (
          <PromptCard key={i} label={p.label} prompt={p.prompt} index={i} />
        ))}
      </div>
    </div>
  )
}
