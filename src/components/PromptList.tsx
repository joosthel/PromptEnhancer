/**
 * @file PromptList.tsx
 * Renders the generated prompt set: an optional collapsible visual style panel,
 * then a list of {@link PromptCard} components.
 *
 * Owns the revision orchestration: a single `revisingIndex` ensures only one card
 * is in-flight at a time. Calls `/api/revise` and delegates the result back to
 * the parent via `onPromptUpdate`.
 *
 * Props:
 *   - prompts / visualStyleCues: the generated output from /api/generate
 *   - userInputs: forwarded to /api/revise as scene context
 *   - onPromptUpdate: parent callback to update a single prompt in-place
 */
'use client'

import { useState } from 'react'
import { VisualStyleCues, UserInputs } from '@/lib/system-prompt'
import PromptCard from './PromptCard'

interface PromptListProps {
  prompts: Array<{ label: string; prompt: string }>
  visualStyleCues?: VisualStyleCues
  userInputs: UserInputs
  onPromptUpdate: (index: number, newPrompt: string) => void
}

export default function PromptList({ prompts, visualStyleCues, userInputs, onPromptUpdate }: PromptListProps) {
  const [showCues, setShowCues] = useState(false)
  const [revisingIndex, setRevisingIndex] = useState<number | null>(null)

  async function handleRevise(index: number, revisionNote: string): Promise<void> {
    setRevisingIndex(index)
    try {
      const res = await fetch('/api/revise', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: prompts[index].prompt,
          label: prompts[index].label,
          revisionNote,
          userInputs,
          visualStyleCues,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `Request failed with status ${res.status}`)
      onPromptUpdate(index, data.prompt)
    } finally {
      setRevisingIndex(null)
    }
    // Errors propagate to PromptCard.handleApply catch
  }

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
          <PromptCard
            key={i}
            label={p.label}
            prompt={p.prompt}
            index={i}
            onRevise={handleRevise}
            isRevising={revisingIndex === i}
          />
        ))}
      </div>
    </div>
  )
}
