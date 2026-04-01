'use client'

import { useState } from 'react'
import { TargetModel, GenerationMode } from '@/lib/model-profiles'
import FixToolbar from './FixToolbar'
import FixHistory from './FixHistory'
import ModelChips from './ModelChips'

interface PromptCardProps {
  label: string
  prompt: string
  negativePrompt?: string
  index: number
  activeModel: TargetModel
  activeMode: GenerationMode
  history: Array<{ prompt: string; fix: string; timestamp: number }>
  isSelected: boolean
  onToggleSelect: () => void
  onFix: (fixCategory: string, customNote?: string) => Promise<void>
  onRestore: (historyIndex: number) => void
  onModelReformat: (toModel: TargetModel) => void
  isFixing: boolean
  reformatLoadingModel: TargetModel | null
}

export default function PromptCard({
  label,
  prompt,
  negativePrompt,
  index,
  activeModel,
  activeMode,
  history,
  isSelected,
  onToggleSelect,
  onFix,
  onRestore,
  onModelReformat,
  isFixing,
  reformatLoadingModel,
}: PromptCardProps) {
  const [copied, setCopied] = useState(false)
  const [copiedNeg, setCopiedNeg] = useState(false)
  const [fixOpen, setFixOpen] = useState(false)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(prompt)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
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

  async function handleCopyNeg() {
    if (!negativePrompt) return
    try {
      await navigator.clipboard.writeText(negativePrompt)
      setCopiedNeg(true)
      setTimeout(() => setCopiedNeg(false), 2000)
    } catch {
      const textarea = document.createElement('textarea')
      textarea.value = negativePrompt
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      setCopiedNeg(true)
      setTimeout(() => setCopiedNeg(false), 2000)
    }
  }

  return (
    <div className="group relative border border-neutral-200 rounded-sm p-4 bg-white hover:border-neutral-300 hover:shadow-sm transition-all">
      {/* Header row */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={onToggleSelect}
            className="accent-neutral-900 w-3.5 h-3.5 cursor-pointer"
          />
          <span className="text-[10px] font-mono text-neutral-400">{String(index + 1).padStart(2, '0')}</span>
          <span className="text-xs uppercase tracking-widest text-neutral-500 font-medium">{label}</span>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            onClick={() => setFixOpen((o) => !o)}
            disabled={isFixing}
            className="text-xs px-2 py-1 min-h-[44px] border border-neutral-200 rounded-sm text-neutral-400 hover:text-neutral-700 hover:border-neutral-300 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isFixing ? 'Fixing...' : fixOpen ? 'Close' : 'Fix'}
          </button>
          <button
            onClick={handleCopy}
            aria-label="Copy prompt"
            className="text-xs px-2 py-1 min-h-[44px] border border-neutral-200 rounded-sm text-neutral-400 hover:text-neutral-700 hover:border-neutral-300 transition-all"
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>

      {/* Prompt text */}
      <p className="text-sm text-neutral-700 leading-relaxed">{prompt}</p>

      {/* Negative prompt */}
      {negativePrompt && (
        <div className="mt-3 pt-3 border-t border-neutral-100">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] uppercase tracking-widest text-neutral-400">Negative</span>
            <button
              onClick={handleCopyNeg}
              aria-label="Copy negative prompt"
              className="text-[10px] px-1.5 py-0.5 text-neutral-400 hover:text-neutral-600 transition-colors"
            >
              {copiedNeg ? 'Copied' : 'Copy'}
            </button>
          </div>
          <p className="text-xs text-neutral-400 leading-relaxed">{negativePrompt}</p>
        </div>
      )}

      {/* Fix toolbar */}
      {fixOpen && (
        <FixToolbar
          onFix={(fixCategory, customNote) => onFix(fixCategory, customNote)}
          isFixing={isFixing}
        />
      )}

      {/* Bottom row */}
      <div className="flex items-end justify-between mt-3">
        <FixHistory history={history} onRestore={onRestore} />
        <ModelChips
          activeModel={activeModel}
          activeMode={activeMode}
          loadingModel={reformatLoadingModel}
          onModelClick={onModelReformat}
        />
      </div>
    </div>
  )
}
