import {
  MAX_IRVE_ROWS_PER_SEARCH,
  MAX_SEARCH_RADIUS_KM,
  MIN_SEARCH_RADIUS_KM,
  TTL,
} from '@/config/constants'
import {
  boundingBoxAround,
  haversineDistanceKm,
  roundCoordinate,
  type BoundingBox,
  type LatLng,
} from '@/lib/geo/coordinates'
import { NetworkError } from '@/lib/network/errors'
import { isFresh, withDb, type StoredStation } from '@/lib/storage/db'
import type { ChargingStation, StationWithDistance } from '@/types/domain'
import { runIrveWorker } from '@/workers/irve-worker-client'
import type {
  ChargingStationRepository,
  NearbyResult,
  NearbySearch,
} from '../repository'
import { countRowsInBoundingBox } from './tabular-client'
import { resolveIrveResource } from './dataset-resource'

/** Cache key for a search area, rounded so nearby pans reuse the same entry. */
function searchKey(box: BoundingBox): string {
  const round = (value: number) => roundCoordinate(value, 2).toFixed(2)
  return `bbox:${round(box.minLat)}:${round(box.maxLat)}:${round(box.minLon)}:${round(box.maxLon)}`
}

function toStored(station: ChargingStation): StoredStation {
  return {
    ...station,
    lat: station.location.latitude,
    lon: station.location.longitude,
    cachedAt: Date.now(),
  }
}

function stripStorageFields(stored: StoredStation): ChargingStation {
  const { lat: _lat, lon: _lon, cachedAt: _cachedAt, ...station } = stored
  return station
}

/**
 * Picks a radius the tabular API can actually serve.
 *
 * Dense city centres hold thousands of points de charge per square kilometre;
 * rather than paginating forever we probe the row count once and shrink the
 * radius until the area fits inside `MAX_IRVE_ROWS_PER_SEARCH` (spec 7.3).
 */
async function fitRadius(
  resourceId: string,
  center: LatLng,
  requestedRadiusKm: number,
  signal?: AbortSignal,
): Promise<{ radiusKm: number; box: BoundingBox; estimatedRows: number }> {
  const radiusKm = Math.min(MAX_SEARCH_RADIUS_KM, Math.max(MIN_SEARCH_RADIUS_KM, requestedRadiusKm))
  const box = boundingBoxAround(center, radiusKm)

  let estimatedRows: number
  try {
    estimatedRows = await countRowsInBoundingBox(resourceId, box, signal)
  } catch {
    // The probe is an optimisation: if it fails, try the requested radius anyway.
    return { radiusKm, box, estimatedRows: 0 }
  }

  if (estimatedRows <= MAX_IRVE_ROWS_PER_SEARCH) return { radiusKm, box, estimatedRows }

  // Row count grows roughly with the area, hence the square root.
  const ratio = Math.sqrt(MAX_IRVE_ROWS_PER_SEARCH / estimatedRows)
  const shrunk = Math.max(MIN_SEARCH_RADIUS_KM, radiusKm * ratio)

  return {
    radiusKm: shrunk,
    box: boundingBoxAround(center, shrunk),
    estimatedRows,
  }
}

async function readCachedSearch(
  key: string,
  center: LatLng,
  radiusKm: number,
): Promise<{ stations: StationWithDistance[]; fetchedAt: number; truncated: boolean } | null> {
  return withDb(async (db) => {
    const entry = await db.searchCache.get(key)
    if (!entry) return null
    const stored = await db.stations.bulkGet(entry.stationIds)
    const stations = stored
      .filter((item): item is StoredStation => Boolean(item))
      .map((item) => {
        const station = stripStorageFields(item)
        return {
          ...station,
          straightLineDistanceKm: haversineDistanceKm(center, station.location),
        }
      })
      .filter((station) => station.straightLineDistanceKm <= radiusKm)
      .sort((a, b) => a.straightLineDistanceKm - b.straightLineDistanceKm)

    if (stations.length === 0) return null
    return { stations, fetchedAt: entry.fetchedAt, truncated: entry.truncated }
  })
}

async function writeCachedSearch(
  key: string,
  box: BoundingBox,
  stations: readonly ChargingStation[],
  truncated: boolean,
): Promise<void> {
  await withDb(async (db) => {
    await db.stations.bulkPut(stations.map(toStored))
    await db.searchCache.put({
      key,
      minLat: box.minLat,
      maxLat: box.maxLat,
      minLon: box.minLon,
      maxLon: box.maxLon,
      stationIds: stations.map((station) => station.id),
      fetchedAt: Date.now(),
      truncated,
    })
  })
}

/** Last-resort read: any cached station geographically close enough. */
async function readCachedByRadius(
  center: LatLng,
  radiusKm: number,
): Promise<StationWithDistance[] | null> {
  const box = boundingBoxAround(center, radiusKm)
  return withDb(async (db) => {
    const candidates = await db.stations
      .where('lat')
      .between(box.minLat, box.maxLat, true, true)
      .toArray()

    const stations = candidates
      .filter((station) => station.lon >= box.minLon && station.lon <= box.maxLon)
      .map((item) => {
        const station = stripStorageFields(item)
        return {
          ...station,
          straightLineDistanceKm: haversineDistanceKm(center, station.location),
        }
      })
      .filter((station) => station.straightLineDistanceKm <= radiusKm)
      .sort((a, b) => a.straightLineDistanceKm - b.straightLineDistanceKm)

    return stations.length > 0 ? stations : null
  })
}

export class IrveChargingStationRepository implements ChargingStationRepository {
  async getNearby(input: NearbySearch): Promise<NearbyResult> {
    const { center, radiusKm, signal } = input
    const requestedRadius = Math.min(
      MAX_SEARCH_RADIUS_KM,
      Math.max(MIN_SEARCH_RADIUS_KM, radiusKm),
    )
    const probeBox = boundingBoxAround(center, requestedRadius)
    const key = searchKey(probeBox)

    // Fresh cache hit: answer without touching the network at all.
    const cached = await readCachedSearch(key, center, requestedRadius)
    if (cached && isFresh(cached.fetchedAt, TTL.irveLocal)) {
      return {
        stations: cached.stations,
        origin: 'cache',
        effectiveRadiusKm: requestedRadius,
        truncated: cached.truncated,
        fetchedAt: cached.fetchedAt,
      }
    }

    if (input.cacheOnly) {
      const offline = cached?.stations ?? (await readCachedByRadius(center, requestedRadius))
      if (!offline) {
        throw new NetworkError('offline', 'Aucune donnée locale disponible pour cette zone.')
      }
      return {
        stations: offline,
        origin: 'cache',
        effectiveRadiusKm: requestedRadius,
        truncated: cached?.truncated ?? false,
        fetchedAt: cached?.fetchedAt ?? 0,
      }
    }

    try {
      const resource = await resolveIrveResource({ signal })
      const fitted = await fitRadius(resource.resourceId, center, requestedRadius, signal)

      const result = await runIrveWorker(
        {
          type: 'search',
          resourceId: resource.resourceId,
          box: fitted.box,
          center,
          radiusKm: fitted.radiusKm,
          maxRows: MAX_IRVE_ROWS_PER_SEARCH,
          source: {
            datasetUpdatedAt: resource.sourceUpdatedAt,
            resourceId: resource.resourceId,
          },
        },
        signal,
      )

      const truncated = result.truncated || fitted.estimatedRows > MAX_IRVE_ROWS_PER_SEARCH
      void writeCachedSearch(searchKey(fitted.box), fitted.box, result.stations, truncated)
      if (searchKey(fitted.box) !== key) {
        void writeCachedSearch(key, fitted.box, result.stations, truncated)
      }

      return {
        stations: result.stations,
        origin: 'network',
        effectiveRadiusKm: fitted.radiusKm,
        truncated,
        datasetUpdatedAt: resource.sourceUpdatedAt,
        fetchedAt: Date.now(),
      }
    } catch (error) {
      // Network trouble: serve whatever the cache holds rather than nothing
      // (spec 45 — "Affichage des dernières données disponibles").
      const fallback = cached?.stations ?? (await readCachedByRadius(center, requestedRadius))
      if (fallback && fallback.length > 0) {
        return {
          stations: fallback,
          origin: 'cache',
          effectiveRadiusKm: requestedRadius,
          truncated: cached?.truncated ?? false,
          fetchedAt: cached?.fetchedAt ?? 0,
        }
      }
      throw error
    }
  }

  async getById(id: string): Promise<ChargingStation | null> {
    const stored = await withDb((db) => db.stations.get(id))
    return stored ? stripStorageFields(stored) : null
  }

  async refresh(): Promise<void> {
    await resolveIrveResource({ force: true })
    await withDb(async (db) => {
      await db.searchCache.clear()
    })
  }
}

export const irveRepository: ChargingStationRepository = new IrveChargingStationRepository()
