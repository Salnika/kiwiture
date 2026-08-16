import { FEATURE_FLAGS } from '@/config/env'

/** Registers the service worker in production only (spec 32). */
export function registerServiceWorker(): void {
  if (!FEATURE_FLAGS.pwa) return
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
  if (import.meta.env.DEV) return

  window.addEventListener('load', () => {
    const url = `${import.meta.env.BASE_URL}sw.js`
    navigator.serviceWorker.register(url, { scope: import.meta.env.BASE_URL }).catch((error) => {
      console.warn('[kiwiture:pwa] Enregistrement du service worker impossible.', error)
    })
  })
}
