import { groupRowsIntoStations } from '@/features/charging-data/irve/station-grouping'
import { fetchRowsInBoundingBox } from '@/features/charging-data/irve/tabular-client'
import { haversineDistanceKm } from '@/lib/geo/coordinates'
import type { StationWithDistance } from '@/types/domain'
import type { WorkerRequest, WorkerResponse } from './irve.worker'

/**
 * Thin promise wrapper around the IRVE worker.
 *
 * Falls back to running the same code on the main thread when Workers are not
 * available (older browsers, some test runners) — correctness first, the freeze
 * risk is accepted only in that degraded path.
 */

export interface WorkerSearchResult {
  stations: StationWithDistance[]
  totalRows: number
  truncated: boolean
}

/** `Omit` over a union must distribute, otherwise the variants collapse. */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never

export type WorkerRequestInput = DistributiveOmit<WorkerRequest, 'requestId'>

let worker: Worker | null = null
let workerUnavailable = false
let nextRequestId = 1

function getWorker(): Worker | null {
  if (workerUnavailable) return null
  if (worker) return worker
  if (typeof Worker === 'undefined') {
    workerUnavailable = true
    return null
  }
  try {
    worker = new Worker(new URL('./irve.worker.ts', import.meta.url), { type: 'module' })
    return worker
  } catch (error) {
    console.warn('[kiwiture:worker] Worker indisponible, traitement sur le thread principal.', error)
    workerUnavailable = true
    return null
  }
}

async function runOnMainThread(request: WorkerRequest): Promise<WorkerSearchResult> {
  if (request.type === 'group') {
    const stations = groupRowsIntoStations(request.rows)
    const center = request.center
    return {
      stations: stations.map((station) => ({
        ...station,
        straightLineDistanceKm: center ? haversineDistanceKm(center, station.location) : Number.NaN,
      })),
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

  const center = request.center
  const withDistance = stations
    .map((station) => ({
      ...station,
      straightLineDistanceKm: haversineDistanceKm(center, station.location),
    }))
    .filter(
      (station) =>
        request.radiusKm === undefined || station.straightLineDistanceKm <= request.radiusKm,
    )
    .sort((a, b) => a.straightLineDistanceKm - b.straightLineDistanceKm)

  return { stations: withDistance, totalRows: total, truncated }
}

export function runIrveWorker(
  request: WorkerRequestInput,
  signal?: AbortSignal,
): Promise<WorkerSearchResult> {
  const instance = getWorker()
  const requestId = nextRequestId++
  const payload = { ...request, requestId } as WorkerRequest

  if (!instance) return runOnMainThread(payload)

  return new Promise<WorkerSearchResult>((resolve, reject) => {
    const cleanup = () => {
      instance.removeEventListener('message', onMessage)
      signal?.removeEventListener('abort', onAbort)
    }

    const onMessage = (event: MessageEvent<WorkerResponse>) => {
      const response = event.data
      if (response.requestId !== requestId) return
      cleanup()
      if (response.type === 'error') {
        reject(Object.assign(new Error(response.message), { kind: response.kind }))
        return
      }
      resolve({
        stations: response.stations,
        totalRows: response.totalRows,
        truncated: response.truncated,
      })
    }

    const onAbort = () => {
      cleanup()
      reject(new DOMException('Recherche annulée', 'AbortError'))
    }

    instance.addEventListener('message', onMessage)
    signal?.addEventListener('abort', onAbort, { once: true })
    instance.postMessage(payload)
  })
}
