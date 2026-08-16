import { CACHE_COORDINATE_PRECISION, TTL } from '@/config/constants'
import { roundCoordinate, type LatLng } from '@/lib/geo/coordinates'
import { isFresh, withDb } from '@/lib/storage/db'
import type { RouteResult } from './provider'

/**
 * Two-level routing cache (spec 17):
 *  - an in-memory map for the current session;
 *  - IndexedDB for reloads and the offline mode.
 */

const memory = new Map<string, { value: RouteResult; fetchedAt: number }>()

const format = (point: LatLng) =>
  `${roundCoordinate(point.latitude, CACHE_COORDINATE_PRECISION)},${roundCoordinate(
    point.longitude,
    CACHE_COORDINATE_PRECISION,
  )}`

/** `route:<origin>:<destination>:<waypoints>` with rounded coordinates. */
export function routeCacheKey(
  providerId: string,
  origin: LatLng,
  destination: LatLng,
  waypoints: readonly LatLng[] = [],
): string {
  const waypointPart = waypoints.length > 0 ? waypoints.map(format).join('|') : 'none'
  return `route:${providerId}:${format(origin)}:${format(destination)}:${waypointPart}`
}

export async function readRouteCache(key: string, ttlMs = TTL.routingShort): Promise<RouteResult | null> {
  const inMemory = memory.get(key)
  if (inMemory && isFresh(inMemory.fetchedAt, ttlMs)) return inMemory.value

  const stored = await withDb((db) => db.routeCache.get(key))
  if (stored && isFresh(stored.fetchedAt, ttlMs)) {
    const value: RouteResult = {
      distanceKm: stored.distanceKm,
      durationMin: stored.durationMin,
      geometry: stored.geometry,
      geometryPrecision: stored.geometry ? 5 : undefined,
    }
    memory.set(key, { value, fetchedAt: stored.fetchedAt })
    return value
  }
  return null
}

/** Offline read: accepts any age, the UI warns that data may be old (spec 31). */
export async function readStaleRouteCache(key: string): Promise<RouteResult | null> {
  const inMemory = memory.get(key)
  if (inMemory) return inMemory.value
  const stored = await withDb((db) => db.routeCache.get(key))
  if (!stored) return null
  return {
    distanceKm: stored.distanceKm,
    durationMin: stored.durationMin,
    geometry: stored.geometry,
  }
}

export async function writeRouteCache(key: string, value: RouteResult): Promise<void> {
  const fetchedAt = Date.now()
  memory.set(key, { value, fetchedAt })
  await withDb((db) =>
    db.routeCache.put({
      key,
      distanceKm: value.distanceKm,
      durationMin: value.durationMin,
      geometry: value.geometry,
      fetchedAt,
    }),
  )
}

export function clearRouteMemoryCache(): void {
  memory.clear()
}
