import { describe, expect, it } from 'vitest'
import type { StationWithDistance } from '@/types/domain'
import { scoreStations, sortStations } from './score-stations'
import { recommendTradeoff } from './tradeoff'

function station(overrides: Partial<StationWithDistance> & { id: string }): StationWithDistance {
  return {
    name: overrides.id,
    location: { latitude: 48.85, longitude: 2.35 },
    evses: [],
    maxPowerKw: 50,
    connectors: ['CCS'],
    payment: { payAsYouGo: true, creditCard: true, other: null, free: false },
    access: { pmr: null },
    pricing: { currency: 'EUR', confidence: 'unknown' },
    source: { id: 'irve', label: 'IRVE' },
    dataQuality: { location: 'good', pricing: 'partial', availability: 'unknown', warnings: [] },
    straightLineDistanceKm: 1,
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

const priced = (id: string, price: number, extra: Partial<StationWithDistance> = {}) =>
  station({
    id,
    pricing: { currency: 'EUR', confidence: 'parsed', energyPricePerKwh: price },
    ...extra,
  })

describe('scoreStations', () => {
  it('ranks the cheaper station first in price mode', () => {
    const result = scoreStations([priced('cher', 0.6), priced('pas-cher', 0.3)], 'price')
    expect(result[0]?.id).toBe('pas-cher')
  })

  it('does not score an unknown price as zero', () => {
    // Same distance and power: the unknown-price station must stay competitive,
    // penalised only slightly rather than sinking to the bottom (spec 24.1).
    const known = priced('connu', 0.9, { straightLineDistanceKm: 5 })
    const unknown = station({ id: 'inconnu', straightLineDistanceKm: 1 })
    const result = scoreStations([known, unknown], 'recommended')
    expect(result[0]?.id).toBe('inconnu')
    expect(result[1]?.score).toBeGreaterThan(0)
  })

  it('penalises price uncertainty when everything else is equal', () => {
    const known = priced('connu', 0.4)
    const unknown = station({ id: 'inconnu' })
    const result = scoreStations([known, unknown], 'recommended')
    expect(result[0]?.id).toBe('connu')
  })

  it('uses the detour when one is available', () => {
    const near = priced('proche', 0.5, { detourDurationMin: 2, detourDistanceKm: 1 })
    const far = priced('loin', 0.5, { detourDurationMin: 25, detourDistanceKm: 20 })
    const result = scoreStations([far, near], 'detour')
    expect(result[0]?.id).toBe('proche')
  })

  it('falls back to the straight-line distance when routing is missing', () => {
    const result = sortStations(
      [priced('loin', 0.5, { straightLineDistanceKm: 9 }), priced('proche', 0.5, { straightLineDistanceKm: 2 })],
      'detour',
    )
    expect(result[0]?.id).toBe('proche')
  })

  it('ranks on the vehicle-limited power, not the station power', () => {
    const big = priced('borne-300', 0.5, { maxPowerKw: 300, effectivePowerKw: 50 })
    const medium = priced('borne-150', 0.5, { maxPowerKw: 150, effectivePowerKw: 150 })
    const result = sortStations([big, medium], 'power')
    expect(result[0]?.id).toBe('borne-150')
  })

  it('pushes unknown prices to the end of the price sort without dropping them', () => {
    const result = sortStations([station({ id: 'inconnu' }), priced('connu', 0.5)], 'price')
    expect(result.map((item) => item.id)).toEqual(['connu', 'inconnu'])
  })

  it('produces scores inside [0, 1]', () => {
    const result = scoreStations([priced('a', 0.2), priced('b', 0.8), station({ id: 'c' })], 'recommended')
    for (const item of result) {
      expect(item.score).toBeGreaterThanOrEqual(0)
      expect(item.score).toBeLessThanOrEqual(1)
    }
  })
})

describe('recommendTradeoff', () => {
  it('recommends paying more to save a meaningful amount of time', () => {
    const cheapSlow = priced('A', 0.39, { detourDurationMin: 19 })
    const pricyFast = priced('B', 0.49, { detourDurationMin: 3 })
    const recommendation = recommendTradeoff([cheapSlow, pricyFast], 30)

    expect(recommendation?.recommended.id).toBe('B')
    expect(recommendation?.tradeoff.extraCostEur).toBeCloseTo(3, 5)
    expect(recommendation?.tradeoff.timeSavedMin).toBe(16)
  })

  it('stays silent when a price is unknown', () => {
    const unknown = station({ id: 'A', detourDurationMin: 19 })
    const known = priced('B', 0.49, { detourDurationMin: 3 })
    expect(recommendTradeoff([unknown, known], 30)).toBeNull()
  })

  it('stays silent when the time saved is negligible', () => {
    const a = priced('A', 0.39, { detourDurationMin: 5 })
    const b = priced('B', 0.49, { detourDurationMin: 3 })
    expect(recommendTradeoff([a, b], 30)).toBeNull()
  })

  it('stays silent when no travel time is known', () => {
    expect(recommendTradeoff([priced('A', 0.39), priced('B', 0.49)], 30)).toBeNull()
  })

  it('stays silent when saving time would be absurdly expensive', () => {
    const cheap = priced('A', 0.2, { detourDurationMin: 15 })
    const expensive = priced('B', 2.5, { detourDurationMin: 8 })
    expect(recommendTradeoff([cheap, expensive], 30)).toBeNull()
  })
})
