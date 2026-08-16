import { z } from 'zod'
import { NetworkError } from '@/lib/network/errors'
import { getJson } from '@/lib/network/http'
import type { LatLng } from '@/lib/geo/coordinates'
import type {
  RouteInput,
  RouteMatrixEntry,
  RouteMatrixInput,
  RouteResult,
  RouteWithWaypointInput,
  RoutingProvider,
} from './provider'

/**
 * OSRM routing provider (default, no token required).
 *
 * Points at the public demo server, whose fair-use policy is why the app caps
 * routing to a shortlist (spec 16). The base URL is overridable so a self-hosted
 * OSRM — still a plain static-friendly HTTP API, no backend of ours — can be
 * used instead.
 */

const DEFAULT_BASE_URL = 'https://router.project-osrm.org'

const routeSchema = z.object({
  code: z.string(),
  routes: z
    .array(
      z.object({
        distance: z.number(),
        duration: z.number(),
        geometry: z.union([z.string(), z.record(z.unknown())]).optional(),
      }),
    )
    .min(1),
})

const tableSchema = z.object({
  code: z.string(),
  durations: z.array(z.array(z.number().nullable())).optional(),
  distances: z.array(z.array(z.number().nullable())).optional(),
})

const coord = (point: LatLng) => `${point.longitude.toFixed(6)},${point.latitude.toFixed(6)}`

export class OsrmRoutingProvider implements RoutingProvider {
  readonly id = 'osrm'
  readonly attribution = 'Routing OSRM — données OpenStreetMap'
  /** The demo server accepts up to 100 coordinates per table request. */
  readonly matrixLimit = 90

  constructor(private readonly baseUrl: string = DEFAULT_BASE_URL) {}

  private async route(points: readonly LatLng[], input: RouteInput): Promise<RouteResult> {
    const params = new URLSearchParams({
      overview: input.withGeometry ? 'simplified' : 'false',
      alternatives: 'false',
      steps: 'false',
    })
    if (input.withGeometry) params.set('geometries', 'polyline')

    const url = `${this.baseUrl}/route/v1/driving/${points.map(coord).join(';')}?${params.toString()}`
    const response = await getJson(url, routeSchema, {
      timeoutMs: 12_000,
      retries: 1,
      signal: input.signal,
    })

    if (response.code !== 'Ok') {
      throw new NetworkError('validation', "Aucun itinéraire routier n'a pu être calculé.", { url })
    }

    const best = response.routes[0]
    if (!best) throw new NetworkError('validation', 'Itinéraire vide.', { url })

    const geometry = typeof best.geometry === 'string' ? best.geometry : undefined

    return {
      distanceKm: best.distance / 1000,
      durationMin: best.duration / 60,
      geometry,
      geometryPrecision: geometry ? 5 : undefined,
    }
  }

  getRoute(input: RouteInput): Promise<RouteResult> {
    return this.route([input.origin, input.destination], input)
  }

  getRouteWithWaypoint(input: RouteWithWaypointInput): Promise<RouteResult> {
    return this.route([input.origin, input.waypoint, input.destination], input)
  }

  async getMatrix(input: RouteMatrixInput): Promise<Array<RouteMatrixEntry | null>> {
    if (input.destinations.length === 0) return []

    const points = [input.origin, ...input.destinations]
    const params = new URLSearchParams({
      sources: '0',
      annotations: 'duration,distance',
    })
    const url = `${this.baseUrl}/table/v1/driving/${points.map(coord).join(';')}?${params.toString()}`

    const response = await getJson(url, tableSchema, {
      timeoutMs: 15_000,
      retries: 1,
      signal: input.signal,
    })
    if (response.code !== 'Ok') {
      throw new NetworkError('validation', 'Matrice de distances indisponible.', { url })
    }

    const distances = response.distances?.[0]
    const durations = response.durations?.[0]

    return input.destinations.map((_, index) => {
      // Index 0 is the origin against itself.
      const distance = distances?.[index + 1]
      const duration = durations?.[index + 1]
      if (distance === null || distance === undefined) return null
      if (duration === null || duration === undefined) return null
      return { distanceKm: distance / 1000, durationMin: duration / 60 }
    })
  }
}
