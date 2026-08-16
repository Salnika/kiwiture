import { useCallback, useRef, useState, type ReactNode } from 'react'

/**
 * Mobile bottom sheet (spec 19.2).
 *
 * Three states, reachable by drag, click and keyboard. `touch-action: none` on
 * the handle keeps a drag from scrolling the map underneath.
 */

export type SheetState = 'collapsed' | 'half' | 'expanded'

const ORDER: SheetState[] = ['collapsed', 'half', 'expanded']

const STATE_LABELS: Record<SheetState, string> = {
  collapsed: 'Liste réduite',
  half: 'Liste à mi-hauteur',
  expanded: 'Liste étendue',
}

export interface BottomSheetProps {
  state: SheetState
  onStateChange: (state: SheetState) => void
  title: string
  children: ReactNode
  className?: string
}

export function BottomSheet({
  state,
  onStateChange,
  title,
  children,
  className,
}: BottomSheetProps) {
  const dragStart = useRef<number | null>(null)
  const [dragging, setDragging] = useState(false)

  const step = useCallback(
    (direction: 1 | -1) => {
      const index = ORDER.indexOf(state)
      const next = ORDER[Math.min(ORDER.length - 1, Math.max(0, index + direction))]
      if (next) onStateChange(next)
    },
    [state, onStateChange],
  )

  const onPointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    dragStart.current = event.clientY
    setDragging(true)
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const onPointerUp = (event: React.PointerEvent<HTMLButtonElement>) => {
    const start = dragStart.current
    dragStart.current = null
    setDragging(false)
    if (start === null) return

    const delta = event.clientY - start
    // Below the threshold the gesture reads as a tap: cycle to the next state.
    if (Math.abs(delta) < 24) {
      step(state === 'expanded' ? -1 : 1)
      return
    }
    step(delta < 0 ? 1 : -1)
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      step(1)
    } else if (event.key === 'ArrowDown') {
      event.preventDefault()
      step(-1)
    }
  }

  return (
    <section
      className={['sheet', className ?? ''].join(' ')}
      data-state={state}
      data-dragging={dragging}
      aria-label={title}
    >
      <button
        type="button"
        className="sheet__handle"
        aria-label={`${title} — ${STATE_LABELS[state]}. Flèches haut et bas pour redimensionner.`}
        aria-expanded={state !== 'collapsed'}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onKeyDown={onKeyDown}
      >
        <span className="sheet__grip" aria-hidden="true" />
      </button>
      <div className="sheet__content">{children}</div>
    </section>
  )
}
