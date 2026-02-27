/**
 * @file PromptCard.tsx
 * Displays a single generated Flux 2 [pro] prompt with copy and inline revision controls.
 *
 * Props:
 *   - label / prompt / index: prompt content
 *   - onRevise: async callback to the parent; throws on API error so the card can surface it
 *   - isRevising: true while this card's revision request is in-flight (disables controls)
 */
'use client'

import { useState } from 'react'

interface PromptCardProps {
  label: string
  prompt: string
  index: number
  onRevise: (index: number, revisionNote: string) => Promise<void>
  isRevising: boolean
}

export default function PromptCard({ label, prompt, index, onRevise, isRevising }: PromptCardProps) {
  const [copied, setCopied] = useState(false)
  const [reviseOpen, setReviseOpen] = useState(false)
  const [revisionNote, setRevisionNote] = useState('')
  const [revisionError, setRevisionError] = useState<string | null>(null)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(prompt)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback for environments without clipboard API
      const textarea = document.createElement('textarea')
      textarea.value = prompt
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  async function handleApply() {
    if (!revisionNote.trim()) return
    setRevisionError(null)
    try {
      await onRevise(index, revisionNote)
      setReviseOpen(false)
      setRevisionNote('')
    } catch (err) {
      setRevisionError(err instanceof Error ? err.message : 'Revision failed. Please try again.')
    }
  }

  function handleCancel() {
    setReviseOpen(false)
    setRevisionNote('')
    setRevisionError(null)
  }

  return (
    <div className="group relative border border-neutral-200 rounded-sm p-4 bg-white hover:border-neutral-300 hover:shadow-sm transition-all">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-neutral-400">{String(index + 1).padStart(2, '0')}</span>
          <span className="text-xs uppercase tracking-widest text-neutral-500 font-medium">{label}</span>
        </div>
        <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0">
          <button
            onClick={() => setReviseOpen((o) => !o)}
            disabled={isRevising}
            className="text-xs px-2 py-1 border border-neutral-200 rounded-sm text-neutral-400 hover:text-neutral-700 hover:border-neutral-300 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isRevising ? 'Revising…' : 'Revise'}
          </button>
          <button
            onClick={handleCopy}
            className="text-xs px-2 py-1 border border-neutral-200 rounded-sm text-neutral-400 hover:text-neutral-700 hover:border-neutral-300 transition-all"
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>

      <p className="text-sm text-neutral-700 leading-relaxed">{prompt}</p>

      {reviseOpen && (
        <div className="mt-4 pt-4 border-t border-neutral-100 space-y-2">
          <textarea
            value={revisionNote}
            onChange={(e) => setRevisionNote(e.target.value)}
            placeholder="What should change? e.g. make it warmer, add rain, shift to dusk…"
            rows={2}
            disabled={isRevising}
            className="w-full border border-neutral-200 rounded-sm px-3 py-2 text-sm bg-white focus:outline-none focus:border-neutral-400 resize-none placeholder:text-neutral-300 disabled:opacity-50"
          />
          {revisionError && (
            <p className="text-xs text-red-500">{revisionError}</p>
          )}
          <div className="flex gap-2">
            <button
              onClick={handleApply}
              disabled={isRevising || !revisionNote.trim()}
              className="px-3 py-1.5 text-xs bg-neutral-900 text-white rounded-sm hover:bg-neutral-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isRevising ? 'Revising…' : 'Apply'}
            </button>
            <button
              onClick={handleCancel}
              disabled={isRevising}
              className="px-3 py-1.5 text-xs border border-neutral-200 rounded-sm text-neutral-500 hover:border-neutral-400 hover:text-neutral-700 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
