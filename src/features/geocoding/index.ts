import { TTL } from '@/config/constants'
import { providerFamily } from '@/config/env'
import { isFresh, withDb } from '@/lib/storage/db'
import type { LatLng } from '@/lib/geo/coordinates'
import { roundCoordinate } from '@/lib/geo/coordinates'
import { BanGeocodingProvider } from './ban-provider'
import { MapboxGeocodingProvider } from './mapbox-provider'
import type { GeocodingProvider, GeocodingResult } from './provider'

let cached: GeocodingProvider | null = null

/** Returns the active geocoder — Mapbox when configured, BAN otherwise. */
export function getGeocodingProvider(): GeocodingProvider {
  if (cached) return cached
  cached = providerFamily() === 'mapbox' ? new MapboxGeocodingProvider() : new BanGeocodingProvider()
  return cached
}

/** Test seam. */
export function setGeocodingProvider(provider: GeocodingProvider | null): void {
  cached = provider
}

function searchCacheKey(provider: string, query: string, proximity?: LatLng): string {
  const near = proximity
    ? `${roundCoordinate(proximity.latitude, 2)},${roundCoordinate(proximity.longitude, 2)}`
    : 'none'
  return `geo:search:${provider}:${near}:${query.trim().toLowerCase()}`
}

function reverseCacheKey(provider: string, lat: number, lon: number): string {
  return `geo:reverse:${provider}:${roundCoordinate(lat, 4)},${roundCoordinate(lon, 4)}`
}

/** Geocoding search with a 7-day IndexedDB cache (spec 7.2 / 14). */
export async function searchAddress(
  query: string,
  options: { proximity?: LatLng; signal?: AbortSignal } = {},
): Promise<GeocodingResult[]> {
  const provider = getGeocodingProvider()
  const trimmed = query.trim()
  if (trimmed.length < 3) return []

  const key = searchCacheKey(provider.id, trimmed, options.proximity)

  const hit = await withDb((db) => db.geocodeCache.get(key))
  if (hit && isFresh(hit.fetchedAt, TTL.geocoding)) {
    return hit.payload as GeocodingResult[]
  }

  const results = await provider.search(trimmed, options)
  void withDb((db) => db.geocodeCache.put({ key, payload: results, fetchedAt: Date.now() }))
  return results
}

/** Reverse geocoding with the same cache policy. */
export async function reverseGeocode(
  lat: number,
  lon: number,
  options: { signal?: AbortSignal } = {},
): Promise<GeocodingResult> {
  const provider = getGeocodingProvider()
  const key = reverseCacheKey(provider.id, lat, lon)

  const hit = await withDb((db) => db.geocodeCache.get(key))
  if (hit && isFresh(hit.fetchedAt, TTL.geocoding)) {
    return hit.payload as GeocodingResult
  }

  const result = await provider.reverse(lat, lon, options)
  void withDb((db) => db.geocodeCache.put({ key, payload: result, fetchedAt: Date.now() }))
  return result
}

export type { GeocodingProvider, GeocodingResult }
