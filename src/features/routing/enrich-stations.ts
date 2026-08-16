import { MAX_ROUTING_CANDIDATES, ROUTING_CONCURRENCY } from '@/config/constants'
import type { LatLng } from '@/lib/geo/coordinates'
import { mapWithConcurrency } from '@/lib/network/http'
import type { StationWithDistance } from '@/types/domain'
import { getCachedRoute, getCachedRouteWithWaypoint, getRoutingProvider } from './index'
import { readRouteCache, routeCacheKey, writeRouteCache } from './cache'

/**
 * Road distances and detours for a shortlist of stations (spec 15, 16).
 *
 * Pipeline: candidates → Haversine sort → keep the N closest → route only those.
 * The rest keep their straight-line distance, clearly labelled as such.
 */

export interface RoutingEnrichment {
  routeDistanceKm?: number
  routeDurationMin?: number
  detourDistanceKm?: number
  detourDurationMin?: number
}

export interface EnrichmentResult {
  /** Station id → road metrics. */
  byStationId: Map<string, RoutingEnrichment>
  /** Direct origin → destination route, when a destination is set. */
  baseRoute?: { distanceKm: number; durationMin: number }
  /** True when the routing provider could not be reached at all (spec 45). */
  routingUnavailable: boolean
  /** Ids we deliberately did not route. */
  skippedStationIds: string[]
}

export interface EnrichOptions {
  origin: LatLng
  destination?: LatLng | null
  stations: readonly StationWithDistance[]
  maxCandidates?: number
  signal?: AbortSignal
}

/**
 * Detours are clamped at 0: alternative-road noise can make a via-route come out
 * marginally shorter than the direct one, which is meaningless to a user (spec 15.3).
 */
const clampDetour = (value: number): number => (value < 0 ? 0 : value)

export async function enrichStationsWithRouting(
  options: EnrichOptions,
): Promise<EnrichmentResult> {
  const { origin, destination, stations, signal } = options
  const limit = options.maxCandidates ?? MAX_ROUTING_CANDIDATES

  const byStationId = new Map<string, RoutingEnrichment>()

  if (stations.length === 0) {
    return { byStationId, routingUnavailable: false, skippedStationIds: [] }
  }

  // Already sorted by the worker, but never trust the caller.
  const sorted = [...stations].sort((a, b) => a.straightLineDistanceKm - b.straightLineDistanceKm)
  const shortlist = sorted.slice(0, limit)
  const skippedStationIds = sorted.slice(limit).map((station) => station.id)

  if (destination) {
    return enrichWithDetour({ origin, destination, shortlist, skippedStationIds, signal })
  }

  const provider = getRoutingProvider()

  // One matrix call beats N route calls whenever the provider supports it.
  if (provider.getMatrix && provider.matrixLimit) {
    const pending: StationWithDistance[] = []

    for (const station of shortlist) {
      const key = routeCacheKey(provider.id, origin, station.location)
      const hit = await readRouteCache(key)
      if (hit) {
        byStationId.set(station.id, {
          routeDistanceKm: hit.distanceKm,
          routeDurationMin: hit.durationMin,
        })
      } else {
        pending.push(station)
      }
    }

    if (pending.length === 0) {
      return { byStationId, routingUnavailable: false, skippedStationIds }
    }

    try {
      const batchSize = provider.matrixLimit
      for (let start = 0; start < pending.length; start += batchSize) {
        const batch = pending.slice(start, start + batchSize)
        const entries = await provider.getMatrix({
          origin,
          destinations: batch.map((station) => station.location),
          signal,
        })
        batch.forEach((station, index) => {
          const entry = entries[index]
          if (!entry) return
          byStationId.set(station.id, {
            routeDistanceKm: entry.distanceKm,
            routeDurationMin: entry.durationMin,
          })
          void writeRouteCache(routeCacheKey(provider.id, origin, station.location), {
            distanceKm: entry.distanceKm,
            durationMin: entry.durationMin,
          })
        })
      }
      return { byStationId, routingUnavailable: false, skippedStationIds }
    } catch (error) {
      console.warn('[kiwiture:routing] Matrice indisponible, repli sur des appels unitaires.', error)
    }
  }

  // Fallback: individual routes, bounded concurrency.
  let failures = 0
  await mapWithConcurrency(shortlist, ROUTING_CONCURRENCY, async (station) => {
    try {
      const route = await getCachedRoute(origin, station.location, { signal })
      byStationId.set(station.id, {
        routeDistanceKm: route.distanceKm,
        routeDurationMin: route.durationMin,
      })
    } catch {
      failures += 1
    }
  })

  return {
    byStationId,
    routingUnavailable: failures === shortlist.length,
    skippedStationIds,
  }
}

async function enrichWithDetour(input: {
  origin: LatLng
  destination: LatLng
  shortlist: readonly StationWithDistance[]
  skippedStationIds: string[]
  signal?: AbortSignal
}): Promise<EnrichmentResult> {
  const { origin, destination, shortlist, skippedStationIds, signal } = input
  const byStationId = new Map<string, RoutingEnrichment>()

  let baseRoute: { distanceKm: number; durationMin: number } | undefined
  try {
    const route = await getCachedRoute(origin, destination, { signal, staticRoute: true })
    baseRoute = { distanceKm: route.distanceKm, durationMin: route.durationMin }
  } catch {
    return { byStationId, routingUnavailable: true, skippedStationIds }
  }

  let failures = 0

  await mapWithConcurrency(shortlist, ROUTING_CONCURRENCY, async (station) => {
    try {
      const viaStation = await getCachedRouteWithWaypoint(origin, station.location, destination, {
        signal,
      })
      byStationId.set(station.id, {
        detourDistanceKm: clampDetour(viaStation.distanceKm - (baseRoute?.distanceKm ?? 0)),
        detourDurationMin: clampDetour(viaStation.durationMin - (baseRoute?.durationMin ?? 0)),
      })
    } catch {
      failures += 1
    }
  })

  // Road distance origin → station is still useful next to the detour.
  await mapWithConcurrency(shortlist, ROUTING_CONCURRENCY, async (station) => {
    const existing = byStationId.get(station.id)
    if (!existing) return
    try {
      const route = await getCachedRoute(origin, station.location, { signal })
      existing.routeDistanceKm = route.distanceKm
      existing.routeDurationMin = route.durationMin
    } catch {
      // The detour alone is enough to rank the station.
    }
  })

  return {
    byStationId,
    baseRoute,
    routingUnavailable: failures === shortlist.length,
    skippedStationIds,
  }
}

/** Merges routing metrics back into the station list. */
export function applyEnrichment(
  stations: readonly StationWithDistance[],
  enrichment: EnrichmentResult | undefined,
): StationWithDistance[] {
  if (!enrichment) return [...stations]
  return stations.map((station) => {
    const extra = enrichment.byStationId.get(station.id)
    return extra ? { ...station, ...extra } : station
  })
}
