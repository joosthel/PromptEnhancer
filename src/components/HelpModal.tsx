'use client'

import { useEffect, useRef } from 'react'
import { useFocusTrap } from '@/lib/use-focus-trap'

interface HelpModalProps {
  open: boolean
  onClose: () => void
}

export default function HelpModal({ open, onClose }: HelpModalProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  useFocusTrap(panelRef, open)

  useEffect(() => {
    if (!open) return
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-title"
        className="bg-white max-w-2xl w-full mx-4 rounded-sm shadow-xl max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100">
          <h2 id="help-title" className="text-sm font-medium text-neutral-900">How PromptEnhancer Works</h2>
          <button onClick={onClose} aria-label="Close help" className="text-neutral-400 hover:text-neutral-600 text-lg leading-none">×</button>
        </div>
        <div className="px-6 py-5 space-y-6 text-sm text-neutral-600">
          {/* Pipeline */}
          <section>
            <h3 className="text-xs font-medium text-neutral-900 uppercase tracking-widest mb-2">Pipeline</h3>
            <p className="mb-2">Every generation runs a three-step pipeline:</p>
            <ol className="space-y-1 list-decimal list-inside text-neutral-500">
              <li><span className="text-neutral-700 font-medium">Vision Analysis</span> — An AI vision model reads your reference images and extracts color palette, lighting, texture, and emotional tone.</li>
              <li><span className="text-neutral-700 font-medium">Creative Brief</span> — A planning model develops a production brief: creative vision, visual metaphor, shot diversity, and color anchors.</li>
              <li><span className="text-neutral-700 font-medium">Prompt Derivation</span> — Prompts are derived from the brief, formatted for the target model&apos;s specific strengths.</li>
            </ol>
          </section>

          {/* Modes */}
          <section>
            <h3 className="text-xs font-medium text-neutral-900 uppercase tracking-widest mb-2">Modes</h3>
            <div className="space-y-3">
              <div>
                <p className="font-medium text-neutral-800">Prompt Enhancement</p>
                <p className="text-neutral-500">Paste an existing prompt and optimize it for a specific model. The enhancer restructures, expands, and adapts your prompt to the target model&apos;s strengths.</p>
              </div>
              <div>
                <p className="font-medium text-neutral-800">Prompt Generation</p>
                <p className="text-neutral-500">The full pipeline. Upload reference images for style and mood, describe your concept, and generate a diverse set of model-optimized prompts. Supports Generate (text-to-image), Edit (image-to-image), and Video sub-modes.</p>
              </div>
              <div>
                <p className="font-medium text-neutral-800">Art Direction</p>
                <p className="text-neutral-500">Develop creative briefs and visual narratives without generating final prompts. Get a creative vision, visual metaphor, shot diversity matrix, and color anchors for planning shoots and visual storytelling.</p>
              </div>
            </div>
          </section>

          {/* Tips */}
          <section>
            <h3 className="text-xs font-medium text-neutral-900 uppercase tracking-widest mb-2">Workflow Tips</h3>
            <ul className="space-y-1 text-neutral-500 list-disc list-inside">
              <li>Reference images are cached — re-generating with the same images skips the vision step and saves time.</li>
              <li>Label images (click a thumbnail) to tell the model their role: style reference, subject, face, background.</li>
              <li>Use Fix buttons to refine iteratively without re-running the full pipeline: Hands, Lighting, Too AI, etc.</li>
              <li>Prompt count (1–6) controls diversity — 4 is the sweet spot for exploring a concept.</li>
              <li>Enhance Mode transforms an existing prompt rather than generating from scratch.</li>
            </ul>
          </section>

          {/* Models */}
          <section>
            <h3 className="text-xs font-medium text-neutral-900 uppercase tracking-widest mb-2">Supported Models</h3>
            <div className="space-y-2 text-neutral-500">
              <div><span className="text-neutral-800 font-medium">Flux 2 Klein 9B</span> — Best for cinematic stills with precise composition. Keep prompts concise (50–100 words). No negative prompts.</div>
              <div><span className="text-neutral-800 font-medium">NanoBanana 2</span> — Fast and flexible. Handles up to 14 reference images with character consistency. Generate + Edit modes.</div>
              <div><span className="text-neutral-800 font-medium">Veo 3.1</span> — Google video model. Structured scenes with camera movement, dialogue, and ambient audio.</div>
              <div><span className="text-neutral-800 font-medium">Kling v3 / o3</span> — Multi-shot video with character labels and temporal markers. Supports negative prompts.</div>
              <div><span className="text-neutral-800 font-medium">LTX-Video 2.3</span> — High-resolution video (up to 4K). Flowing present-tense descriptions with native audio support.</div>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
