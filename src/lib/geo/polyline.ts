import type { LatLng } from './coordinates'

/**
 * Decodes an encoded polyline (Google / OSRM / Mapbox format).
 *
 * `precision` is 5 for OSRM's default `polyline` and Google's format, 6 for
 * OSRM `polyline6` and Mapbox Directions' default geometry.
 */
export function decodePolyline(encoded: string, precision = 5): LatLng[] {
  const factor = 10 ** precision
  const points: LatLng[] = []
  let index = 0
  let lat = 0
  let lon = 0

  while (index < encoded.length) {
    let result = 0
    let shift = 0
    let byte: number

    do {
      byte = encoded.charCodeAt(index++) - 63
      result |= (byte & 0x1f) << shift
      shift += 5
    } while (byte >= 0x20)
    lat += result & 1 ? ~(result >> 1) : result >> 1

    result = 0
    shift = 0
    do {
      byte = encoded.charCodeAt(index++) - 63
      result |= (byte & 0x1f) << shift
      shift += 5
    } while (byte >= 0x20)
    lon += result & 1 ? ~(result >> 1) : result >> 1

    points.push({ latitude: lat / factor, longitude: lon / factor })
  }

  return points
}

/** Keeps at most `maxPoints` evenly spaced vertices — enough for a corridor test. */
export function simplifyByStride(points: readonly LatLng[], maxPoints: number): LatLng[] {
  if (points.length <= maxPoints) return [...points]
  const stride = Math.ceil(points.length / maxPoints)
  const result: LatLng[] = []
  for (let i = 0; i < points.length; i += stride) result.push(points[i] as LatLng)
  const last = points[points.length - 1] as LatLng
  if (result[result.length - 1] !== last) result.push(last)
  return result
}
