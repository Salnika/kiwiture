import { haversineDistanceKm, type LatLng } from './coordinates'

/**
 * Shortest distance in km from a point to a polyline (spec 23.1).
 *
 * Implemented directly rather than pulling in Turf: on the scale of a route
 * corridor an equirectangular projection is accurate to well under a percent,
 * and it keeps the bundle small (spec 35.2).
 */
export function distanceToPolylineKm(point: LatLng, line: readonly LatLng[]): number {
  if (line.length === 0) return Number.POSITIVE_INFINITY
  if (line.length === 1) return haversineDistanceKm(point, line[0] as LatLng)

  const latRad = (point.latitude * Math.PI) / 180
  const kmPerDegLat = 110.574
  const kmPerDegLon = 111.32 * Math.cos(latRad)

  const px = point.longitude * kmPerDegLon
  const py = point.latitude * kmPerDegLat

  let best = Number.POSITIVE_INFINITY

  for (let i = 0; i < line.length - 1; i += 1) {
    const a = line[i] as LatLng
    const b = line[i + 1] as LatLng

    const ax = a.longitude * kmPerDegLon
    const ay = a.latitude * kmPerDegLat
    const bx = b.longitude * kmPerDegLon
    const by = b.latitude * kmPerDegLat

    const dx = bx - ax
    const dy = by - ay
    const lengthSq = dx * dx + dy * dy

    let t = 0
    if (lengthSq > 0) {
      t = ((px - ax) * dx + (py - ay) * dy) / lengthSq
      t = Math.max(0, Math.min(1, t))
    }

    const cx = ax + t * dx
    const cy = ay + t * dy
    const distance = Math.hypot(px - cx, py - cy)

    if (distance < best) best = distance
  }

  return best
}

/** Keeps the points within `corridorKm` of the route (spec 23). */
export function filterByCorridor<T extends LatLng>(
  points: readonly T[],
  line: readonly LatLng[],
  corridorKm: number,
): Array<T & { corridorDistanceKm: number }> {
  const result: Array<T & { corridorDistanceKm: number }> = []
  for (const point of points) {
    const corridorDistanceKm = distanceToPolylineKm(point, line)
    if (corridorDistanceKm <= corridorKm) result.push({ ...point, corridorDistanceKm })
  }
  return result
}
