import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { useMemo } from 'react'
import {
  DEFAULT_REQUESTED_KWH,
  MAX_ROUTING_CANDIDATES,
  ROUTE_CORRIDOR_KM,
} from '@/config/constants'
import { irveRepository } from '@/features/charging-data/irve/repository'
import type { NearbyResult } from '@/features/charging-data/repository'
import {
  applyEnrichment,
  enrichStationsWithRouting,
  type EnrichmentResult,
} from '@/features/routing/enrich-stations'
import { getCachedRoute } from '@/features/routing'
import { effectivePowerKw, calculateChargeCost } from '@/features/pricing/calculate-charge-cost'
import { useActiveVehicle, useSettingsStore } from '@/features/settings/settings-store'
import { distanceToPolylineKm } from '@/lib/geo/corridor'
import { decodePolyline, simplifyByStride } from '@/lib/geo/polyline'
import { roundCoordinate, type LatLng } from '@/lib/geo/coordinates'
import type { StationWithDistance } from '@/types/domain'
import { useSearchStore } from './search-store'
import { filterStations } from './filters/filters'
import { sortStations } from './scoring/score-stations'

/**
 * Server state for the station search.
 *
 * Split in three queries so a routing outage never blocks the station list
 * (spec 45) and so panning the map does not re-run the expensive parts.
 */

const roundedKey = (point: LatLng | null | undefined) =>
  point ? `${roundCoordinate(point.latitude, 3)},${roundCoordinate(point.longitude, 3)}` : 'none'

export function useNearbyStations(
  origin: LatLng | null,
  radiusKm: number,
): UseQueryResult<NearbyResult> {
  return useQuery({
    queryKey: ['stations', 'nearby', roundedKey(origin), Math.round(radiusKm)],
    enabled: origin !== null,
    queryFn: ({ signal }) => {
      if (!origin) throw new Error('Origine manquante')
      return irveRepository.getNearby({ center: origin, radiusKm, signal })
    },
    staleTime: 10 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    retry: 1,
  })
}

/** Direct origin → destination route, and its geometry for the trip corridor. */
export function useBaseRoute(origin: LatLng | null, destination: LatLng | null) {
  return useQuery({
    queryKey: ['route', 'base', roundedKey(origin), roundedKey(destination)],
    enabled: origin !== null && destination !== null,
    queryFn: async ({ signal }) => {
      if (!origin || !destination) throw new Error('Trajet incomplet')
      return getCachedRoute(origin, destination, {
        signal,
        withGeometry: true,
        staticRoute: true,
        allowStale: true,
      })
    },
    staleTime: 30 * 60 * 1000,
    retry: 1,
  })
}

export function useRoutingEnrichment(
  origin: LatLng | null,
  destination: LatLng | null,
  stations: readonly StationWithDistance[],
): UseQueryResult<EnrichmentResult> {
  // Only the shortlist matters for the key: routing never runs on the long tail.
  const shortlistKey = useMemo(
    () =>
      stations
        .slice(0, MAX_ROUTING_CANDIDATES)
        .map((station) => station.id)
        .join('|'),
    [stations],
  )

  return useQuery({
    queryKey: ['route', 'enrich', roundedKey(origin), roundedKey(destination), shortlistKey],
    enabled: origin !== null && stations.length > 0,
    queryFn: ({ signal }) => {
      if (!origin) throw new Error('Origine manquante')
      return enrichStationsWithRouting({ origin, destination, stations, signal })
    },
    staleTime: 15 * 60 * 1000,
    retry: 0,
  })
}

export interface StationSearchView {
  /** Filtered, enriched and sorted list ready for the UI. */
  stations: StationWithDistance[]
  /** Everything found, before filters — used for the "no result" messaging. */
  allStations: StationWithDistance[]
  isLoading: boolean
  isFetching: boolean
  error: unknown
  origin: 'network' | 'cache' | null
  truncated: boolean
  effectiveRadiusKm: number
  datasetUpdatedAt?: string
  fetchedAt?: number
  routingUnavailable: boolean
  routedStationIds: Set<string>
}

/**
 * Single entry point for the home screen: nearby stations, enriched with road
 * metrics, vehicle-aware power, cost estimates, then filtered and sorted.
 */
export function useStationSearch(): StationSearchView {
  const origin = useSearchStore((state) => state.origin)
  const destination = useSearchStore((state) => state.destination)
  const radiusKm = useSearchStore((state) => state.radiusKm)
  const filters = useSearchStore((state) => state.filters)
  const sort = useSearchStore((state) => state.sort)
  const mode = useSearchStore((state) => state.mode)
  const vehicle = useActiveVehicle()
  const requestedKwh = useRequestedEnergy()

  const nearby = useNearbyStations(origin, radiusKm)
  const baseRoute = useBaseRoute(origin, mode === 'trip' ? destination : null)

  const corridorFiltered = useMemo(() => {
    const stations = nearby.data?.stations ?? []
    if (mode !== 'trip' || !baseRoute.data?.geometry) return stations

    const line = simplifyByStride(
      decodePolyline(baseRoute.data.geometry, baseRoute.data.geometryPrecision ?? 5),
      400,
    )
    return stations
      .map((station) => ({
        ...station,
        corridorDistanceKm: distanceToPolylineKm(station.location, line),
      }))
      .filter((station) => (station.corridorDistanceKm ?? Infinity) <= ROUTE_CORRIDOR_KM)
  }, [nearby.data?.stations, mode, baseRoute.data?.geometry, baseRoute.data?.geometryPrecision])

  const enrichment = useRoutingEnrichment(
    origin,
    mode === 'trip' ? destination : null,
    corridorFiltered,
  )

  const enriched = useMemo(() => {
    const withRouting = applyEnrichment(corridorFiltered, enrichment.data)
    return withRouting.map((station) => {
      const power = effectivePowerKw(station.maxPowerKw, station.connectors, vehicle)
      const cost = calculateChargeCost({ price: station.pricing, requestedKwh })
      return {
        ...station,
        effectivePowerKw: power,
        estimatedCostEur: cost.computable ? cost.totalEur : undefined,
      }
    })
  }, [corridorFiltered, enrichment.data, vehicle, requestedKwh])

  const visible = useMemo(
    () => sortStations(filterStations(enriched, filters), sort),
    [enriched, filters, sort],
  )

  const routedStationIds = useMemo(
    () => new Set(enrichment.data ? [...enrichment.data.byStationId.keys()] : []),
    [enrichment.data],
  )

  return {
    stations: visible,
    allStations: enriched,
    isLoading: nearby.isLoading,
    isFetching: nearby.isFetching || enrichment.isFetching,
    error: nearby.error,
    origin: nearby.data?.origin ?? null,
    truncated: nearby.data?.truncated ?? false,
    effectiveRadiusKm: nearby.data?.effectiveRadiusKm ?? radiusKm,
    datasetUpdatedAt: nearby.data?.datasetUpdatedAt,
    fetchedAt: nearby.data?.fetchedAt,
    routingUnavailable: enrichment.data?.routingUnavailable ?? false,
    routedStationIds,
  }
}

/** Energy the user wants to add, in kWh (spec 11). */
export function useRequestedEnergy(): number {
  return useSettingsStore((state) => state.settings.requestedEnergyKwh ?? DEFAULT_REQUESTED_KWH)
}
