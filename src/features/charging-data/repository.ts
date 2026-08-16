import type { BoundingBox, LatLng } from '@/lib/geo/coordinates'
import type { ChargingStation, StationWithDistance } from '@/types/domain'

export interface NearbySearch {
  center: LatLng
  radiusKm: number
  signal?: AbortSignal
  /** Skip the network and answer from the local cache only. */
  cacheOnly?: boolean
}

export interface NearbyResult {
  stations: StationWithDistance[]
  /** Where the answer came from — drives the "données en cache" banner (spec 45). */
  origin: 'network' | 'cache'
  /** Radius actually used; shrunk when the area was too dense (spec 7.3). */
  effectiveRadiusKm: number
  /** True when the area holds more stations than we loaded. */
  truncated: boolean
  datasetUpdatedAt?: string
  fetchedAt: number
}

export interface BoundingBoxSearch {
  box: BoundingBox
  center: LatLng
  signal?: AbortSignal
}

/** Data-source contract — the UI never calls data.gouv directly (spec 38.3). */
export interface ChargingStationRepository {
  getNearby(input: NearbySearch): Promise<NearbyResult>
  getById(id: string): Promise<ChargingStation | null>
  refresh(): Promise<void>
}
