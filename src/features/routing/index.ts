import { TTL } from '@/config/constants'
import { providerFamily } from '@/config/env'
import type { LatLng } from '@/lib/geo/coordinates'
import { MapboxRoutingProvider } from './mapbox-routing-provider'
import { OsrmRoutingProvider } from './osrm-routing-provider'
import { readRouteCache, readStaleRouteCache, routeCacheKey, writeRouteCache } from './cache'
import type { RouteResult, RoutingProvider } from './provider'

let cachedProvider: RoutingProvider | null = null

/** Active routing provider — Mapbox when configured, OSRM otherwise. */
export function getRoutingProvider(): RoutingProvider {
  if (cachedProvider) return cachedProvider
  cachedProvider = providerFamily() === 'mapbox' ? new MapboxRoutingProvider() : new OsrmRoutingProvider()
  return cachedProvider
}

/** Test seam. */
export function setRoutingProvider(provider: RoutingProvider | null): void {
  cachedProvider = provider
}

export interface CachedRouteOptions {
  signal?: AbortSignal
  withGeometry?: boolean
  /** Longer TTL for a route that does not depend on live traffic (spec 7.2). */
  staticRoute?: boolean
  /** Accept an expired cache entry rather than failing (offline mode). */
  allowStale?: boolean
}

/** Origin → destination route, memoised on rounded coordinates (spec 17). */
export async function getCachedRoute(
  origin: LatLng,
  destination: LatLng,
  options: CachedRouteOptions = {},
): Promise<RouteResult> {
  const provider = getRoutingProvider()
  const key = routeCacheKey(provider.id, origin, destination)
  const ttl = options.staticRoute ? TTL.routingStatic : TTL.routingShort

  const hit = await readRouteCache(key, ttl)
  if (hit && (!options.withGeometry || hit.geometry)) return hit

  try {
    const result = await provider.getRoute({
      origin,
      destination,
      signal: options.signal,
      withGeometry: options.withGeometry,
    })
    void writeRouteCache(key, result)
    return result
  } catch (error) {
    if (options.allowStale) {
      const stale = await readStaleRouteCache(key)
      if (stale) return stale
    }
    throw error
  }
}

/** Origin → waypoint → destination route, same caching policy. */
export async function getCachedRouteWithWaypoint(
  origin: LatLng,
  waypoint: LatLng,
  destination: LatLng,
  options: CachedRouteOptions = {},
): Promise<RouteResult> {
  const provider = getRoutingProvider()
  const key = routeCacheKey(provider.id, origin, destination, [waypoint])
  const ttl = options.staticRoute ? TTL.routingStatic : TTL.routingShort

  const hit = await readRouteCache(key, ttl)
  if (hit) return hit

  try {
    const result = await provider.getRouteWithWaypoint({
      origin,
      waypoint,
      destination,
      signal: options.signal,
      withGeometry: options.withGeometry,
    })
    void writeRouteCache(key, result)
    return result
  } catch (error) {
    if (options.allowStale) {
      const stale = await readStaleRouteCache(key)
      if (stale) return stale
    }
    throw error
  }
}

export type { RouteResult, RoutingProvider }
export { routeCacheKey } from './cache'
