import { describe, expect, it } from 'vitest'
import type { ChargingPrice, LocalVehicle } from '@/types/domain'
import {
  calculateChargeCost,
  effectivePowerKw,
  energyForSocRange,
  estimateChargingMinutes,
} from './calculate-charge-cost'

const price = (overrides: Partial<ChargingPrice> = {}): ChargingPrice => ({
  currency: 'EUR',
  confidence: 'parsed',
  ...overrides,
})

describe('calculateChargeCost', () => {
  it('computes the energy cost', () => {
    const result = calculateChargeCost({
      price: price({ energyPricePerKwh: 0.49 }),
      requestedKwh: 30,
    })
    expect(result.computable).toBe(true)
    expect(result.energyCostEur).toBeCloseTo(14.7, 5)
    expect(result.totalEur).toBeCloseTo(14.7, 5)
  })

  it('adds the session fee', () => {
    const result = calculateChargeCost({
      price: price({ energyPricePerKwh: 0.35, sessionFee: 0.5 }),
      requestedKwh: 30,
    })
    expect(result.totalEur).toBeCloseTo(11, 5)
    expect(result.sessionFeeEur).toBe(0.5)
  })

  it('refuses to compute anything when the price is unknown', () => {
    const result = calculateChargeCost({
      price: price({ confidence: 'unknown' }),
      requestedKwh: 30,
    })
    expect(result.computable).toBe(false)
    expect(result.totalEur).toBeUndefined()
  })

  it('handles a free station', () => {
    const result = calculateChargeCost({
      price: price({ energyPricePerKwh: 0 }),
      requestedKwh: 30,
    })
    expect(result.computable).toBe(true)
    expect(result.totalEur).toBe(0)
  })

  it('flags a partial total when a time component cannot be evaluated', () => {
    const result = calculateChargeCost({
      price: price({ energyPricePerKwh: 0.4, minuteFee: 0.05 }),
      requestedKwh: 30,
    })
    expect(result.partial).toBe(true)
    expect(result.warnings.some((warning) => warning.includes('part au temps'))).toBe(true)
  })

  it('adds the time component when a duration is known', () => {
    const result = calculateChargeCost({
      price: price({ energyPricePerKwh: 0.4, minuteFee: 0.05 }),
      requestedKwh: 30,
      estimatedMinutes: 40,
    })
    expect(result.partial).toBe(false)
    expect(result.totalEur).toBeCloseTo(12 + 2, 5)
  })

  it('rejects a non-positive energy request', () => {
    expect(
      calculateChargeCost({ price: price({ energyPricePerKwh: 0.4 }), requestedKwh: 0 }).computable,
    ).toBe(false)
  })
})

describe('energyForSocRange', () => {
  it('computes 60 kWh from 20% to 80%', () => {
    expect(energyForSocRange(60, 20, 80)).toBeCloseTo(36, 5)
  })

  it('returns 0 when the target is below the current level', () => {
    expect(energyForSocRange(60, 80, 20)).toBe(0)
  })

  it('clamps to the 0–100 range', () => {
    expect(energyForSocRange(60, -10, 120)).toBeCloseTo(60, 5)
  })

  it('returns 0 for an invalid capacity', () => {
    expect(energyForSocRange(0, 20, 80)).toBe(0)
  })
})

describe('effectivePowerKw', () => {
  const vehicle: LocalVehicle = {
    id: 'v1',
    label: 'Test',
    batteryCapacityKwh: 60,
    maxDcPowerKw: 170,
    maxAcPowerKw: 11,
    connectors: ['CCS', 'TYPE_2'],
  }

  it('returns the station power without a vehicle', () => {
    expect(effectivePowerKw(300, ['CCS'], null)).toBe(300)
  })

  it('caps DC power with the vehicle limit', () => {
    expect(effectivePowerKw(300, ['CCS'], vehicle)).toBe(170)
  })

  it('caps AC power with the AC limit', () => {
    expect(effectivePowerKw(22, ['TYPE_2'], vehicle)).toBe(11)
  })

  it('never raises the station power', () => {
    expect(effectivePowerKw(50, ['CCS'], vehicle)).toBe(50)
  })

  it('falls back to the station power when the vehicle limit is unknown', () => {
    const partial: LocalVehicle = { ...vehicle, maxDcPowerKw: undefined }
    expect(effectivePowerKw(300, ['CCS'], partial)).toBe(300)
  })
})

describe('estimateChargingMinutes', () => {
  it('estimates a duration with an efficiency factor', () => {
    const minutes = estimateChargingMinutes(30, 50)
    expect(minutes).toBeGreaterThan(30)
    expect(minutes).toBeLessThan(60)
  })

  it('returns undefined without usable power', () => {
    expect(estimateChargingMinutes(30, 0)).toBeUndefined()
  })
})
