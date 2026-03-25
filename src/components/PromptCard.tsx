'use client'

import { useState } from 'react'
import { TargetModel } from '@/lib/model-profiles'
import FixToolbar from './FixToolbar'
import FixHistory from './FixHistory'
import ModelChips from './ModelChips'

const CARD_MODEL_CHIPS: TargetModel[] = ['flux-2-pro', 'z-image', 'nanobanana-2']

interface PromptCardProps {
  label: string
  prompt: string
  index: number
  activeModel: TargetModel
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
  index,
  activeModel,
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
        <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0">
          <button
            onClick={() => setFixOpen((o) => !o)}
            disabled={isFixing}
            className="text-xs px-2 py-1 border border-neutral-200 rounded-sm text-neutral-400 hover:text-neutral-700 hover:border-neutral-300 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isFixing ? 'Fixing...' : fixOpen ? 'Close' : 'Fix'}
          </button>
          <button
            onClick={handleCopy}
            className="text-xs px-2 py-1 border border-neutral-200 rounded-sm text-neutral-400 hover:text-neutral-700 hover:border-neutral-300 transition-all"
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>

      {/* Prompt text */}
      <p className="text-sm text-neutral-700 leading-relaxed">{prompt}</p>

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
          availableModels={CARD_MODEL_CHIPS}
          loadingModel={reformatLoadingModel}
          onModelClick={onModelReformat}
        />
      </div>
    </div>
  )
}
