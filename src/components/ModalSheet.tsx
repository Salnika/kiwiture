import { useCallback, useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import './modal-sheet.css'

/**
 * Accessible modal sheet.
 *
 * Slides up from the bottom on phones and centres itself on wide screens. It
 * traps focus, closes on Escape or backdrop click, and returns focus to the
 * element that opened it (spec 36).
 */

export interface ModalSheetProps {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  /** Rendered in the sticky footer, e.g. a reset action. */
  footer?: ReactNode
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function ModalSheet({ open, title, onClose, children, footer }: ModalSheetProps) {
  const panelRef = useRef<HTMLDivElement | null>(null)
  const closeRef = useRef<HTMLButtonElement | null>(null)
  const previouslyFocused = useRef<HTMLElement | null>(null)

  const onKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!open) return

      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }

      if (event.key !== 'Tab') return

      const panel = panelRef.current
      if (!panel) return
      const focusable = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (element) => element.offsetParent !== null,
      )
      if (focusable.length === 0) return

      const first = focusable[0] as HTMLElement
      const last = focusable[focusable.length - 1] as HTMLElement

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    },
    [open, onClose],
  )

  useEffect(() => {
    if (!open) return

    previouslyFocused.current = document.activeElement as HTMLElement | null
    closeRef.current?.focus()

    document.addEventListener('keydown', onKeyDown)
    // Keep the page behind the sheet from scrolling under the user's finger.
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
      previouslyFocused.current?.focus()
    }
  }, [open, onKeyDown])

  if (!open) return null

  /*
   * Rendered through a portal: the trigger lives inside the header, which has
   * its own z-index and would otherwise clamp the overlay below the results
   * sheet no matter how high its own z-index is.
   */
  return createPortal(
    <div className="modal-sheet" role="presentation">
      <button
        type="button"
        className="modal-sheet__backdrop"
        aria-label="Fermer"
        tabIndex={-1}
        onClick={onClose}
      />
      <div
        className="modal-sheet__panel"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        ref={panelRef}
      >
        <header className="modal-sheet__header">
          <h2 className="modal-sheet__title">{title}</h2>
          <button
            type="button"
            className="modal-sheet__close"
            aria-label="Fermer"
            onClick={onClose}
            ref={closeRef}
          >
            ✕
          </button>
        </header>
        <div className="modal-sheet__content">{children}</div>
        {footer ? <footer className="modal-sheet__footer">{footer}</footer> : null}
      </div>
    </div>,
    document.body,
  )
}
