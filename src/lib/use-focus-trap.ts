import { useEffect, useRef, RefObject } from 'react'

const FOCUSABLE = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function useFocusTrap(containerRef: RefObject<HTMLElement | null>, active: boolean) {
  const previousFocus = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!active || !containerRef.current) return

    previousFocus.current = document.activeElement as HTMLElement

    const container = containerRef.current
    const focusables = container.querySelectorAll<HTMLElement>(FOCUSABLE)
    if (focusables.length > 0) focusables[0].focus()

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Tab') return
      const els = container.querySelectorAll<HTMLElement>(FOCUSABLE)
      if (els.length === 0) return

      const first = els[0]
      const last = els[els.length - 1]

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    container.addEventListener('keydown', handleKeyDown)
    return () => {
      container.removeEventListener('keydown', handleKeyDown)
      previousFocus.current?.focus()
    }
  }, [active, containerRef])
}
