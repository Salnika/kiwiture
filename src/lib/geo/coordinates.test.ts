import { describe, expect, it } from 'vitest'
import {
  boundingBoxAround,
  boundingBoxContains,
  haversineDistanceKm,
  isInsideBoundingBox,
  isValidCoordinate,
  roundCoordinate,
} from './coordinates'
import { distanceToPolylineKm } from './corridor'
import { decodePolyline } from './polyline'

const PARIS = { latitude: 48.8566, longitude: 2.3522 }
const LYON = { latitude: 45.764, longitude: 4.8357 }

describe('haversineDistanceKm', () => {
  it('returns 0 for the same point', () => {
    expect(haversineDistanceKm(PARIS, PARIS)).toBe(0)
  })

  it('matches the known Paris–Lyon great-circle distance', () => {
    // ~392 km as the crow flies.
    expect(haversineDistanceKm(PARIS, LYON)).toBeGreaterThan(388)
    expect(haversineDistanceKm(PARIS, LYON)).toBeLessThan(396)
  })

  it('is symmetric', () => {
    expect(haversineDistanceKm(PARIS, LYON)).toBeCloseTo(haversineDistanceKm(LYON, PARIS), 6)
  })

  it('handles short distances', () => {
    const nearby = { latitude: 48.8576, longitude: 2.3522 }
    expect(haversineDistanceKm(PARIS, nearby)).toBeCloseTo(0.111, 2)
  })
})

describe('isValidCoordinate', () => {
  it('accepts a normal position', () => {
    expect(isValidCoordinate(48.85, 2.35)).toBe(true)
  })

  it('rejects out-of-range latitudes and longitudes', () => {
    expect(isValidCoordinate(91, 2)).toBe(false)
    expect(isValidCoordinate(-91, 2)).toBe(false)
    expect(isValidCoordinate(45, 181)).toBe(false)
    expect(isValidCoordinate(45, -181)).toBe(false)
  })

  it('rejects null island and NaN', () => {
    expect(isValidCoordinate(0, 0)).toBe(false)
    expect(isValidCoordinate(Number.NaN, 2)).toBe(false)
    expect(isValidCoordinate(48, Number.NaN)).toBe(false)
  })

  it('rejects non-numeric input', () => {
    expect(isValidCoordinate('48', '2')).toBe(false)
    expect(isValidCoordinate(null, undefined)).toBe(false)
  })
})

describe('roundCoordinate', () => {
  it('rounds to the requested precision', () => {
    expect(roundCoordinate(48.856614, 4)).toBe(48.8566)
    expect(roundCoordinate(2.352222, 2)).toBe(2.35)
  })

  it('collapses nearby coordinates onto the same cache key', () => {
    expect(roundCoordinate(48.85661, 4)).toBe(roundCoordinate(48.85664, 4))
  })
})

describe('boundingBoxAround', () => {
  it('covers the requested radius', () => {
    const box = boundingBoxAround(PARIS, 5)
    const north = { latitude: box.maxLat, longitude: PARIS.longitude }
    expect(haversineDistanceKm(PARIS, north)).toBeGreaterThan(4.9)
    expect(haversineDistanceKm(PARIS, north)).toBeLessThan(5.1)
  })

  it('contains the centre', () => {
    expect(isInsideBoundingBox(PARIS, boundingBoxAround(PARIS, 2))).toBe(true)
  })

  it('excludes a point beyond the radius', () => {
    expect(isInsideBoundingBox(LYON, boundingBoxAround(PARIS, 10))).toBe(false)
  })

  it('nests smaller boxes inside larger ones', () => {
    expect(boundingBoxContains(boundingBoxAround(PARIS, 10), boundingBoxAround(PARIS, 2))).toBe(true)
    expect(boundingBoxContains(boundingBoxAround(PARIS, 2), boundingBoxAround(PARIS, 10))).toBe(false)
  })
})

describe('distanceToPolylineKm', () => {
  const line = [
    { latitude: 48.8, longitude: 2.3 },
    { latitude: 48.9, longitude: 2.3 },
  ]

  it('returns ~0 for a point on the line', () => {
    expect(distanceToPolylineKm({ latitude: 48.85, longitude: 2.3 }, line)).toBeLessThan(0.01)
  })

  it('measures the perpendicular distance', () => {
    const distance = distanceToPolylineKm({ latitude: 48.85, longitude: 2.32 }, line)
    expect(distance).toBeGreaterThan(1.3)
    expect(distance).toBeLessThan(1.7)
  })

  it('clamps to the segment ends', () => {
    const beyond = distanceToPolylineKm({ latitude: 48.95, longitude: 2.3 }, line)
    expect(beyond).toBeGreaterThan(5)
  })
})

describe('decodePolyline', () => {
  it('decodes the reference Google polyline', () => {
    const points = decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@')
    expect(points).toHaveLength(3)
    expect(points[0]?.latitude).toBeCloseTo(38.5, 4)
    expect(points[0]?.longitude).toBeCloseTo(-120.2, 4)
    expect(points[2]?.latitude).toBeCloseTo(43.252, 3)
  })
})
