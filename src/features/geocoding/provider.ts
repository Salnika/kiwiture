import type { LatLng } from '@/lib/geo/coordinates'

export interface GeocodingResult {
  id: string
  /** Short label, e.g. `12 rue de Rivoli`. */
  label: string
  /** Full label including city and postcode. */
  context?: string
  latitude: number
  longitude: number
  kind?: 'address' | 'street' | 'city' | 'poi' | 'other'
}

/** Geocoding contract — swappable provider (spec 14 / 38.2). */
export interface GeocodingProvider {
  readonly id: string
  readonly attribution: string
  search(query: string, options?: { proximity?: LatLng; signal?: AbortSignal }): Promise<GeocodingResult[]>
  reverse(lat: number, lon: number, options?: { signal?: AbortSignal }): Promise<GeocodingResult>
}
