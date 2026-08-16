export interface LatLng {
  latitude: number
  longitude: number
}

export interface BoundingBox {
  minLat: number
  maxLat: number
  minLon: number
  maxLon: number
}

const EARTH_RADIUS_KM = 6371.0088

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180

/** Coordinates that fail this check are dropped from the dataset (spec 9.4). */
export function isValidCoordinate(latitude: unknown, longitude: unknown): boolean {
  if (typeof latitude !== 'number' || typeof longitude !== 'number') return false
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false
  if (latitude < -90 || latitude > 90) return false
  if (longitude < -180 || longitude > 180) return false
  // (0, 0) in the Gulf of Guinea is the classic "missing coordinates" sentinel.
  if (latitude === 0 && longitude === 0) return false
  return true
}

/**
 * Great-circle distance in km.
 * Used only to pre-filter stations and to cap routing calls — never displayed
 * as a road distance (spec 15.1).
 */
export function haversineDistanceKm(a: LatLng, b: LatLng): number {
  const dLat = toRadians(b.latitude - a.latitude)
  const dLon = toRadians(b.longitude - a.longitude)
  const lat1 = toRadians(a.latitude)
  const lat2 = toRadians(b.latitude)

  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2)
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Rounds a coordinate for cache keys (spec 17). */
export function roundCoordinate(value: number, precision = 4): number {
  const factor = 10 ** precision
  return Math.round(value * factor) / factor
}

/** Axis-aligned bounding box covering a radius around a point. */
export function boundingBoxAround(center: LatLng, radiusKm: number): BoundingBox {
  const latDelta = radiusKm / 111.32
  const cosLat = Math.cos(toRadians(center.latitude))
  // Near the poles the meridians converge; guard against a division blow-up.
  const lonDelta = radiusKm / (111.32 * Math.max(0.01, Math.abs(cosLat)))

  return {
    minLat: Math.max(-90, center.latitude - latDelta),
    maxLat: Math.min(90, center.latitude + latDelta),
    minLon: Math.max(-180, center.longitude - lonDelta),
    maxLon: Math.min(180, center.longitude + lonDelta),
  }
}

export function isInsideBoundingBox(point: LatLng, box: BoundingBox): boolean {
  return (
    point.latitude >= box.minLat &&
    point.latitude <= box.maxLat &&
    point.longitude >= box.minLon &&
    point.longitude <= box.maxLon
  )
}

/** Box that contains both inputs. */
export function unionBoundingBox(a: BoundingBox, b: BoundingBox): BoundingBox {
  return {
    minLat: Math.min(a.minLat, b.minLat),
    maxLat: Math.max(a.maxLat, b.maxLat),
    minLon: Math.min(a.minLon, b.minLon),
    maxLon: Math.max(a.maxLon, b.maxLon),
  }
}

/** True when `inner` is fully covered by `outer` — used to reuse a cached search. */
export function boundingBoxContains(outer: BoundingBox, inner: BoundingBox): boolean {
  return (
    outer.minLat <= inner.minLat &&
    outer.maxLat >= inner.maxLat &&
    outer.minLon <= inner.minLon &&
    outer.maxLon >= inner.maxLon
  )
}

export function boundingBoxOf(points: readonly LatLng[]): BoundingBox | null {
  if (points.length === 0) return null
  let minLat = Infinity
  let maxLat = -Infinity
  let minLon = Infinity
  let maxLon = -Infinity
  for (const point of points) {
    if (point.latitude < minLat) minLat = point.latitude
    if (point.latitude > maxLat) maxLat = point.latitude
    if (point.longitude < minLon) minLon = point.longitude
    if (point.longitude > maxLon) maxLon = point.longitude
  }
  return { minLat, maxLat, minLon, maxLon }
}

/** Approximate radius in km covering a bounding box from its centre. */
export function boundingBoxRadiusKm(box: BoundingBox): number {
  const center = {
    latitude: (box.minLat + box.maxLat) / 2,
    longitude: (box.minLon + box.maxLon) / 2,
  }
  return haversineDistanceKm(center, { latitude: box.maxLat, longitude: box.maxLon })
}
