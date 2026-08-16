import Dexie, { type Table } from 'dexie'
import type { ChargingStation, LocalVehicle, UserSettings } from '@/types/domain'

/** Dataset resource resolved from data.gouv (spec 7.1). */
export interface DatasetMetadata {
  id: string
  sourceUrl: string
  resourceId?: string
  fetchedAt: number
  sourceUpdatedAt?: string
  schemaVersion?: string
}

/** A cached geographic search, keyed by its rounded bounding box. */
export interface StationSearchCacheEntry {
  key: string
  minLat: number
  maxLat: number
  minLon: number
  maxLon: number
  stationIds: string[]
  fetchedAt: number
  truncated: boolean
}

export interface StoredStation extends ChargingStation {
  /** Denormalised for Dexie range queries. */
  lat: number
  lon: number
  cachedAt: number
}

export interface GeocodeCacheEntry {
  key: string
  payload: unknown
  fetchedAt: number
}

export interface RouteCacheEntry {
  key: string
  distanceKm: number
  durationMin: number
  geometry?: string
  fetchedAt: number
}

export interface SettingsRecord {
  key: 'user-settings'
  value: UserSettings
}

class KiwitureDatabase extends Dexie {
  stations!: Table<StoredStation, string>
  metadata!: Table<DatasetMetadata, string>
  searchCache!: Table<StationSearchCacheEntry, string>
  geocodeCache!: Table<GeocodeCacheEntry, string>
  routeCache!: Table<RouteCacheEntry, string>
  settings!: Table<SettingsRecord, string>
  vehicles!: Table<LocalVehicle, string>

  constructor() {
    super('kiwiture')
    this.version(1).stores({
      stations: 'id, lat, lon, cachedAt, maxPowerKw',
      metadata: 'id, fetchedAt',
      searchCache: 'key, fetchedAt',
      geocodeCache: 'key, fetchedAt',
      routeCache: 'key, fetchedAt',
      settings: 'key',
      vehicles: 'id',
    })
  }
}

let instance: KiwitureDatabase | null = null

/**
 * IndexedDB is unavailable in a few contexts (private windows on some browsers,
 * hardened settings). Every caller must tolerate `null` — the app still works,
 * it simply loses its offline cache.
 */
export function getDb(): KiwitureDatabase | null {
  if (instance) return instance
  if (typeof indexedDB === 'undefined') return null
  try {
    instance = new KiwitureDatabase()
    return instance
  } catch (error) {
    console.warn('[kiwiture:db] IndexedDB indisponible, cache local desactive.', error)
    return null
  }
}

/** Runs `work` against the database, swallowing storage failures. */
export async function withDb<T>(work: (db: KiwitureDatabase) => Promise<T>): Promise<T | null> {
  const db = getDb()
  if (!db) return null
  try {
    return await work(db)
  } catch (error) {
    console.warn('[kiwiture:db] Operation IndexedDB echouee.', error)
    return null
  }
}

export function isFresh(fetchedAt: number | undefined, ttlMs: number): boolean {
  if (!fetchedAt) return false
  return Date.now() - fetchedAt < ttlMs
}

/** Drops cache entries older than their TTL. */
export async function pruneExpired(ttl: {
  stations: number
  geocoding: number
  routing: number
}): Promise<void> {
  await withDb(async (db) => {
    const now = Date.now()
    await Promise.all([
      db.searchCache.where('fetchedAt').below(now - ttl.stations).delete(),
      db.stations.where('cachedAt').below(now - ttl.stations * 7).delete(),
      db.geocodeCache.where('fetchedAt').below(now - ttl.geocoding).delete(),
      db.routeCache.where('fetchedAt').below(now - ttl.routing).delete(),
    ])
  })
}

export type { KiwitureDatabase }
