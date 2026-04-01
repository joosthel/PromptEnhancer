'use client'

import { useEffect, useRef } from 'react'
import { useFocusTrap } from '@/lib/use-focus-trap'

interface CreditPopupProps {
  open: boolean
  onContinue: () => void
  onCancel: () => void
}

export default function CreditPopup({ open, onContinue, onCancel }: CreditPopupProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  useFocusTrap(panelRef, open)

  useEffect(() => {
    if (!open) return
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [open, onCancel])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onCancel}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="credit-title"
        className="bg-white max-w-sm w-full mx-4 rounded-sm shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-5 space-y-4">
          <h2 id="credit-title" className="sr-only">API Credit Notice</h2>
          <div className="space-y-2">
            <p className="text-sm text-neutral-700">
              This is a personal project by <span className="font-medium">Joost Helfers</span>. Every generation uses real API credits, funded personally.
            </p>
            <p className="text-sm text-neutral-500">
              If you like the project, get in touch at{' '}
              <a
                href="https://joosthelfers.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-neutral-700 underline underline-offset-2 hover:text-neutral-900 transition-colors"
              >
                joosthelfers.com
              </a>
              {' '}and we can talk about how I could help deploy something similar for you or your company.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={onContinue}
              className="flex-1 py-2.5 bg-neutral-900 text-white text-sm rounded-sm hover:bg-neutral-700 transition-colors"
            >
              Continue
            </button>
            <button
              onClick={onCancel}
              className="flex-1 py-2.5 bg-white text-neutral-500 text-sm rounded-sm border border-neutral-200 hover:border-neutral-400 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
