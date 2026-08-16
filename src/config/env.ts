/**
 * Runtime configuration.
 *
 * Absolute rule (spec 33.1 / 52): only browser-safe public values live here.
 * No secret, no `sk.*` Mapbox token, no private API key ever reaches this bundle.
 */

const raw = import.meta.env

/** Public Mapbox token (`pk.*`). Optional — the app has open-source defaults. */
export const MAPBOX_PUBLIC_TOKEN: string = (raw.VITE_MAPBOX_PUBLIC_TOKEN ?? '').trim()

export const APP_ENV: string = raw.VITE_APP_ENV ?? (raw.DEV ? 'development' : 'production')

export const IS_DEV: boolean = Boolean(raw.DEV)

/**
 * A token that does not start with `pk.` is either invalid or — much worse — a
 * secret token that must never be shipped. We refuse to use it either way.
 */
export const hasUsableMapboxToken = (): boolean => MAPBOX_PUBLIC_TOKEN.startsWith('pk.')

export const mapboxTokenLooksLikeSecret = (): boolean => MAPBOX_PUBLIC_TOKEN.startsWith('sk.')

export type ProviderFamily = 'mapbox' | 'oss'

/**
 * Which provider family serves map tiles, geocoding and routing.
 * Mapbox when a public token is configured, otherwise the open-source stack
 * (MapLibre + CARTO/OSM tiles, BAN geocoder, OSRM routing) — spec 5.3.
 */
export const providerFamily = (): ProviderFamily => (hasUsableMapboxToken() ? 'mapbox' : 'oss')

/** Build-time feature flags (spec 49). No remote flag service. */
export interface FeatureFlags {
  tripSearch: boolean
  vehicleProfile: boolean
  pwa: boolean
  dynamicAvailability: boolean
}

export const FEATURE_FLAGS: FeatureFlags = {
  tripSearch: true,
  vehicleProfile: true,
  pwa: true,
  // No browser-reachable source guarantees real-time availability today (spec 50).
  dynamicAvailability: false,
}

/** Warn loudly in dev when the configuration is unusable or unsafe. */
export function assertEnvSanity(): string[] {
  const problems: string[] = []
  if (mapboxTokenLooksLikeSecret()) {
    problems.push(
      "VITE_MAPBOX_PUBLIC_TOKEN contient un token secret (sk.*). Ce token ne doit JAMAIS etre place dans un build frontend. Il est ignore par l'application.",
    )
  } else if (MAPBOX_PUBLIC_TOKEN && !hasUsableMapboxToken()) {
    problems.push(
      'VITE_MAPBOX_PUBLIC_TOKEN ne ressemble pas a un token public Mapbox (pk.*). Les providers open source sont utilises.',
    )
  }
  if (IS_DEV && problems.length > 0) {
    for (const problem of problems) console.warn(`[kiwiture:config] ${problem}`)
  }
  return problems
}
