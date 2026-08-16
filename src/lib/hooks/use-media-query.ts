import { useEffect, useState } from 'react'

/**
 * Matches a CSS media query in JS.
 *
 * Used to render the station list exactly once — inside the desktop column or
 * inside the mobile bottom sheet, never both. Duplicating it would double the
 * DOM and the virtualiser's work for no benefit.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false
    return window.matchMedia(query).matches
  })

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const list = window.matchMedia(query)
    const listener = (event: MediaQueryListEvent) => setMatches(event.matches)
    setMatches(list.matches)
    list.addEventListener('change', listener)
    return () => list.removeEventListener('change', listener)
  }, [query])

  return matches
}

/** Desktop breakpoint, mirroring the `@media (min-width: 900px)` rule in app.css. */
export const DESKTOP_QUERY = '(min-width: 900px)'
