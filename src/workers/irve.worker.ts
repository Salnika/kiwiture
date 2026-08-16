/// <reference lib="webworker" />

/**
 * IRVE worker (spec 7.4).
 *
 * Owns everything expensive about the national dataset: network fetch, JSON
 * validation, normalisation, station grouping and the bulk Haversine pass. The
 * main thread never touches a raw row, so a dense search cannot freeze the UI.
 */

import { fetchRowsInBoundingBox } from '@/features/charging-data/irve/tabular-client'
import { groupRowsIntoStations } from '@/features/charging-data/irve/station-grouping'
import type { IrveRow } from '@/features/charging-data/irve/types'
import { haversineDistanceKm, type BoundingBox, type LatLng } from '@/lib/geo/coordinates'
import type { ChargingStation, StationWithDistance } from '@/types/domain'

export interface SearchRequest {
  type: 'search'
  requestId: number
  resourceId: string
  box: BoundingBox
  center: LatLng
  maxRows?: number
  radiusKm?: number
  source?: { datasetUpdatedAt?: string; resourceId?: string }
}

export interface GroupRequest {
  type: 'group'
  requestId: number
  rows: IrveRow[]
  center?: LatLng
}

export type WorkerRequest = SearchRequest | GroupRequest

export interface WorkerSuccess {
  type: 'result'
  requestId: number
  stations: StationWithDistance[]
  totalRows: number
  truncated: boolean
}

export interface WorkerFailure {
  type: 'error'
  requestId: number
  message: string
  kind: string
}

export type WorkerResponse = WorkerSuccess | WorkerFailure

function withDistance(
  stations: readonly ChargingStation[],
  center: LatLng | undefined,
  radiusKm?: number,
): StationWithDistance[] {
  if (!center) {
    return stations.map((station) => ({ ...station, straightLineDistanceKm: Number.NaN }))
  }

  const result: StationWithDistance[] = []
  for (const station of stations) {
    const straightLineDistanceKm = haversineDistanceKm(center, station.location)
    // The bounding box is a square around a circle: trim the corners.
    if (radiusKm !== undefined && straightLineDistanceKm > radiusKm) continue
    result.push({ ...station, straightLineDistanceKm })
  }
  result.sort((a, b) => a.straightLineDistanceKm - b.straightLineDistanceKm)
  return result
}

async function handle(request: WorkerRequest): Promise<WorkerSuccess> {
  if (request.type === 'group') {
    const stations = groupRowsIntoStations(request.rows)
    return {
      type: 'result',
      requestId: request.requestId,
      stations: withDistance(stations, request.center),
      totalRows: request.rows.length,
      truncated: false,
    }
  }

  const { rows, total, truncated } = await fetchRowsInBoundingBox(request.resourceId, request.box, {
    maxRows: request.maxRows,
  })

  const stations = groupRowsIntoStations(rows, {
    source: {
      datasetUpdatedAt: request.source?.datasetUpdatedAt,
      resourceId: request.source?.resourceId ?? request.resourceId,
    },
  })

  return {
    type: 'result',
    requestId: request.requestId,
    stations: withDistance(stations, request.center, request.radiusKm),
    totalRows: total,
    truncated,
  }
}

self.addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
  const request = event.data
  void handle(request)
    .then((response) => {
      ;(self as unknown as DedicatedWorkerGlobalScope).postMessage(response)
    })
    .catch((error: unknown) => {
      const failure: WorkerFailure = {
        type: 'error',
        requestId: request.requestId,
        message: error instanceof Error ? error.message : 'Erreur inconnue.',
        kind:
          typeof error === 'object' && error !== null && 'kind' in error
            ? String((error as { kind: unknown }).kind)
            : 'unknown',
      }
      ;(self as unknown as DedicatedWorkerGlobalScope).postMessage(failure)
    })
})
