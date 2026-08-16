import type { LatLng } from '@/lib/geo/coordinates'

export interface RouteInput {
  origin: LatLng
  destination: LatLng
  signal?: AbortSignal
  /** Ask for the route geometry (needed for the trip corridor). */
  withGeometry?: boolean
}

export interface RouteWithWaypointInput extends RouteInput {
  waypoint: LatLng
}

export interface RouteResult {
  distanceKm: number
  durationMin: number
  /** Encoded polyline, present only when requested and supported. */
  geometry?: string
  /** Precision of the encoded polyline (5 or 6). */
  geometryPrecision?: number
}

/** Distances from one origin to many destinations, in a single call. */
export interface RouteMatrixInput {
  origin: LatLng
  destinations: readonly LatLng[]
  signal?: AbortSignal
}

export interface RouteMatrixEntry {
  distanceKm: number
  durationMin: number
}

/** Routing contract — swappable provider (spec 38.1). */
export interface RoutingProvider {
  readonly id: string
  readonly attribution: string
  getRoute(input: RouteInput): Promise<RouteResult>
  getRouteWithWaypoint(input: RouteWithWaypointInput): Promise<RouteResult>
  /**
   * Optional bulk endpoint. When a provider implements it we can price a whole
   * shortlist with one request instead of N (spec 16).
   */
  getMatrix?(input: RouteMatrixInput): Promise<Array<RouteMatrixEntry | null>>
  /** Max destinations accepted by `getMatrix` in one call. */
  readonly matrixLimit?: number
}
