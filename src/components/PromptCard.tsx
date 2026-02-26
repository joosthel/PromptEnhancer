'use client'

import { useState } from 'react'

interface PromptCardProps {
  label: string
  prompt: string
  index: number
}

export default function PromptCard({ label, prompt, index }: PromptCardProps) {
  const [copied, setCopied] = useState(false)

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

  return (
    <div className="group relative border border-neutral-200 rounded-sm p-4 bg-white hover:border-neutral-300 hover:shadow-sm transition-all">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-neutral-400">{String(index + 1).padStart(2, '0')}</span>
          <span className="text-xs uppercase tracking-widest text-neutral-500 font-medium">{label}</span>
        </div>
        <button
          onClick={handleCopy}
          className="flex-shrink-0 text-xs px-2 py-1 border border-neutral-200 rounded-sm text-neutral-400 hover:text-neutral-700 hover:border-neutral-300 transition-all opacity-0 group-hover:opacity-100"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <p className="text-sm text-neutral-700 leading-relaxed">{prompt}</p>
    </div>
  )
}
