/**
 * Kiwiture service worker (spec 32).
 *
 * Strategy:
 *  - app shell + fingerprinted assets: cache-first (they are immutable);
 *  - navigations: network-first with an offline fallback to the cached shell;
 *  - map tiles / styles: stale-while-revalidate, bounded;
 *  - Directions and tabular API responses: NEVER cached here. Their freshness is
 *    owned by the app (IndexedDB + explicit TTLs), and an opaque HTTP cache
 *    would silently serve stale prices and distances.
 *
 * `__BASE__` is replaced at build time with the deployment base path.
 */

const BASE = '__BASE__'
const VERSION = '__VERSION__'
const SHELL_CACHE = `kiwiture-shell-${VERSION}`
const ASSET_CACHE = `kiwiture-assets-${VERSION}`
const TILE_CACHE = `kiwiture-tiles-${VERSION}`

const SHELL_URLS = [BASE, `${BASE}index.html`, `${BASE}manifest.webmanifest`]

/**
 * Fingerprinted build output, injected at build time.
 *
 * These must be precached during `install`: on a first visit the browser fetches
 * them before this worker takes control, so an on-demand cache would still be
 * empty when the user goes offline.
 */
const PRECACHE_URLS = __PRECACHE__

const NEVER_CACHE_HOSTS = [
  'tabular-api.data.gouv.fr',
  'www.data.gouv.fr',
  'api-adresse.data.gouv.fr',
  'router.project-osrm.org',
]

const NEVER_CACHE_PATH_HINTS = ['/directions/', '/directions-matrix/', '/geocoding/', '/route/v1/', '/table/v1/']

const TILE_HOST_HINTS = ['basemaps.cartocdn.com', 'tiles.openfreemap.org', 'api.mapbox.com']

self.addEventListener('install', (event) => {
  event.waitUntil(
    Promise.all([
      caches
        .open(SHELL_CACHE)
        .then((cache) => cache.addAll(SHELL_URLS))
        .catch(() => undefined),
      caches
        .open(ASSET_CACHE)
        // `addAll` is all-or-nothing; cache assets one by one so a single
        // failure cannot leave the app without any offline bundle.
        .then((cache) =>
          Promise.all(PRECACHE_URLS.map((url) => cache.add(url).catch(() => undefined))),
        )
        .catch(() => undefined),
    ]).then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('kiwiture-') && !key.endsWith(VERSION))
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

function isNeverCached(url) {
  if (NEVER_CACHE_HOSTS.includes(url.hostname)) return true
  return NEVER_CACHE_PATH_HINTS.some((hint) => url.pathname.includes(hint))
}

function isTileRequest(url) {
  return TILE_HOST_HINTS.some((host) => url.hostname.includes(host))
}

/**
 * `ignoreVary` matters: static hosts (GitHub Pages, `vite preview`) answer with
 * `Vary: Accept-Encoding`, and a precached entry would otherwise never match a
 * later request whose encoding negotiation differs — silently breaking offline.
 */
const MATCH_OPTIONS = { ignoreVary: true }

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName)
  const hit = await cache.match(request, MATCH_OPTIONS)
  if (hit) return hit
  const response = await fetch(request)
  if (response.ok) cache.put(request, response.clone())
  return response
}

async function staleWhileRevalidate(request, cacheName, maxEntries) {
  const cache = await caches.open(cacheName)
  const hit = await cache.match(request, MATCH_OPTIONS)

  const network = fetch(request)
    .then(async (response) => {
      if (response.ok) {
        await cache.put(request, response.clone())
        if (maxEntries) void trimCache(cache, maxEntries)
      }
      return response
    })
    .catch(() => hit)

  return hit || network
}

async function trimCache(cache, maxEntries) {
  const keys = await cache.keys()
  if (keys.length <= maxEntries) return
  for (const key of keys.slice(0, keys.length - maxEntries)) {
    await cache.delete(key)
  }
}

async function networkFirstNavigation(request) {
  try {
    const response = await fetch(request)
    if (response.ok) {
      const cache = await caches.open(SHELL_CACHE)
      cache.put(`${BASE}index.html`, response.clone())
    }
    return response
  } catch (error) {
    const cache = await caches.open(SHELL_CACHE)
    const fallback =
      (await cache.match(`${BASE}index.html`, MATCH_OPTIONS)) ||
      (await cache.match(BASE, MATCH_OPTIONS))
    if (fallback) return fallback
    throw error
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return

  const url = new URL(request.url)

  if (isNeverCached(url)) return

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(request))
    return
  }

  if (isTileRequest(url)) {
    event.respondWith(staleWhileRevalidate(request, TILE_CACHE, 300))
    return
  }

  if (url.origin === self.location.origin) {
    // Vite fingerprints assets, so a cache hit is always the right content.
    if (url.pathname.includes('/assets/')) {
      event.respondWith(cacheFirst(request, ASSET_CACHE))
      return
    }
    event.respondWith(staleWhileRevalidate(request, SHELL_CACHE, 60))
  }
})
