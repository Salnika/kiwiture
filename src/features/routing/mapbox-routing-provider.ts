import { z } from 'zod'
import { MAPBOX_PUBLIC_TOKEN } from '@/config/env'
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
 * Mapbox Directions / Matrix (spec 5.2, 51).
 * https://docs.mapbox.com/api/navigation/directions/
 *
 * Public `pk.*` token only — restrict it to your production domain in the Mapbox
 * dashboard (spec 33.2).
 */

const DIRECTIONS_URL = 'https://api.mapbox.com/directions/v5/mapbox/driving'
const MATRIX_URL = 'https://api.mapbox.com/directions-matrix/v1/mapbox/driving'

const directionsSchema = z.object({
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

const matrixSchema = z.object({
  code: z.string(),
  durations: z.array(z.array(z.number().nullable())).optional(),
  distances: z.array(z.array(z.number().nullable())).optional(),
})

const coord = (point: LatLng) => `${point.longitude.toFixed(6)},${point.latitude.toFixed(6)}`

export class MapboxRoutingProvider implements RoutingProvider {
  readonly id = 'mapbox'
  readonly attribution = '© Mapbox © OpenStreetMap'
  /** Mapbox Matrix allows 25 coordinates per request on the driving profile. */
  readonly matrixLimit = 24

  private async route(points: readonly LatLng[], input: RouteInput): Promise<RouteResult> {
    const params = new URLSearchParams({
      access_token: MAPBOX_PUBLIC_TOKEN,
      alternatives: 'false',
      steps: 'false',
      overview: input.withGeometry ? 'simplified' : 'false',
      geometries: 'polyline6',
      language: 'fr',
    })

    const url = `${DIRECTIONS_URL}/${points.map(coord).join(';')}?${params.toString()}`
    const response = await getJson(url, directionsSchema, {
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
      geometryPrecision: geometry ? 6 : undefined,
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
      access_token: MAPBOX_PUBLIC_TOKEN,
      sources: '0',
      annotations: 'duration,distance',
    })

    const url = `${MATRIX_URL}/${points.map(coord).join(';')}?${params.toString()}`
    const response = await getJson(url, matrixSchema, {
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
      const distance = distances?.[index + 1]
      const duration = durations?.[index + 1]
      if (distance === null || distance === undefined) return null
      if (duration === null || duration === undefined) return null
      return { distanceKm: distance / 1000, durationMin: duration / 60 }
    })
  }
}
