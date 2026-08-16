import { describe, expect, it } from 'vitest'
import type { StationWithDistance } from '@/types/domain'
import { DEFAULT_FILTERS, countActiveFilters, filterStations } from './filters'

function station(overrides: Partial<StationWithDistance> & { id: string }): StationWithDistance {
  return {
    name: overrides.id,
    location: { latitude: 48.85, longitude: 2.35 },
    evses: [],
    maxPowerKw: 50,
    connectors: ['CCS'],
    payment: { payAsYouGo: null, creditCard: null, other: null, free: null },
    access: { pmr: null },
    pricing: { currency: 'EUR', confidence: 'unknown' },
    source: { id: 'irve', label: 'IRVE' },
    dataQuality: { location: 'good', pricing: 'unknown', availability: 'unknown', warnings: [] },
    straightLineDistanceKm: 1,
    ...overrides,
  }
}

const priced = (id: string, value: number) =>
  station({ id, pricing: { currency: 'EUR', confidence: 'parsed', energyPricePerKwh: value } })

describe('filterStations', () => {
  it('keeps everything with the default filters', () => {
    const stations = [priced('a', 0.4), station({ id: 'b' })]
    expect(filterStations(stations, DEFAULT_FILTERS)).toHaveLength(2)
  })

  it('filters by connector', () => {
    const stations = [
      station({ id: 'ccs', connectors: ['CCS'] }),
      station({ id: 't2', connectors: ['TYPE_2'] }),
    ]
    const result = filterStations(stations, { ...DEFAULT_FILTERS, connectors: ['CCS'] })
    expect(result.map((item) => item.id)).toEqual(['ccs'])
  })

  it('matches any of the selected connectors', () => {
    const stations = [
      station({ id: 'ccs', connectors: ['CCS'] }),
      station({ id: 't2', connectors: ['TYPE_2'] }),
      station({ id: 'chademo', connectors: ['CHADEMO'] }),
    ]
    const result = filterStations(stations, {
      ...DEFAULT_FILTERS,
      connectors: ['CCS', 'CHADEMO'],
    })
    expect(result.map((item) => item.id).sort()).toEqual(['ccs', 'chademo'])
  })

  it('filters by minimum power', () => {
    const stations = [
      station({ id: 'slow', maxPowerKw: 22 }),
      station({ id: 'fast', maxPowerKw: 150 }),
    ]
    const result = filterStations(stations, { ...DEFAULT_FILTERS, minPowerKw: 100 })
    expect(result.map((item) => item.id)).toEqual(['fast'])
  })

  it('excludes unknown prices from a "≤ X €/kWh" filter', () => {
    const stations = [priced('cheap', 0.35), station({ id: 'unknown' })]
    const result = filterStations(stations, { ...DEFAULT_FILTERS, maxPricePerKwh: 0.4 })
    expect(result.map((item) => item.id)).toEqual(['cheap'])
  })

  it('includes unknown prices when the user opts in', () => {
    const stations = [priced('cheap', 0.35), station({ id: 'unknown' })]
    const result = filterStations(stations, {
      ...DEFAULT_FILTERS,
      maxPricePerKwh: 0.4,
      includeUnknownPrice: true,
    })
    expect(result.map((item) => item.id).sort()).toEqual(['cheap', 'unknown'])
  })

  it('still excludes prices above the threshold when unknowns are included', () => {
    const stations = [priced('expensive', 0.8), station({ id: 'unknown' })]
    const result = filterStations(stations, {
      ...DEFAULT_FILTERS,
      maxPricePerKwh: 0.4,
      includeUnknownPrice: true,
    })
    expect(result.map((item) => item.id)).toEqual(['unknown'])
  })

  it('filters by credit-card payment, excluding unknown capabilities', () => {
    const stations = [
      station({ id: 'cb', payment: { payAsYouGo: null, creditCard: true, other: null, free: null } }),
      station({ id: 'unknown' }),
    ]
    const result = filterStations(stations, { ...DEFAULT_FILTERS, paymentCreditCard: true })
    expect(result.map((item) => item.id)).toEqual(['cb'])
  })

  it('filters free stations', () => {
    const stations = [
      station({ id: 'free', payment: { payAsYouGo: null, creditCard: null, other: null, free: true } }),
      priced('paid', 0.4),
    ]
    const result = filterStations(stations, { ...DEFAULT_FILTERS, onlyFree: true })
    expect(result.map((item) => item.id)).toEqual(['free'])
  })

  it('filters 24/7 access', () => {
    const stations = [
      station({ id: 'always', access: { openingHours: '24/7', pmr: null } }),
      station({ id: 'limited', access: { openingHours: 'Mo-Fr 08:00-20:00', pmr: null } }),
    ]
    const result = filterStations(stations, { ...DEFAULT_FILTERS, accessAlwaysOpen: true })
    expect(result.map((item) => item.id)).toEqual(['always'])
  })

  it('filters PMR accessibility', () => {
    const stations = [
      station({ id: 'pmr', access: { pmr: true } }),
      station({ id: 'unknown', access: { pmr: null } }),
    ]
    const result = filterStations(stations, { ...DEFAULT_FILTERS, accessPmr: true })
    expect(result.map((item) => item.id)).toEqual(['pmr'])
  })

  it('combines filters', () => {
    const stations = [
      station({
        id: 'match',
        connectors: ['CCS'],
        maxPowerKw: 150,
        pricing: { currency: 'EUR', confidence: 'parsed', energyPricePerKwh: 0.45 },
        payment: { payAsYouGo: null, creditCard: true, other: null, free: null },
      }),
      station({ id: 'wrong-power', connectors: ['CCS'], maxPowerKw: 22 }),
    ]
    const result = filterStations(stations, {
      ...DEFAULT_FILTERS,
      connectors: ['CCS'],
      minPowerKw: 100,
      maxPricePerKwh: 0.5,
      paymentCreditCard: true,
    })
    expect(result.map((item) => item.id)).toEqual(['match'])
  })
})

describe('countActiveFilters', () => {
  it('counts nothing by default', () => {
    expect(countActiveFilters(DEFAULT_FILTERS)).toBe(0)
  })

  it('counts each active group once', () => {
    expect(
      countActiveFilters({
        ...DEFAULT_FILTERS,
        connectors: ['CCS', 'TYPE_2'],
        minPowerKw: 100,
        paymentCreditCard: true,
      }),
    ).toBe(3)
  })
})
