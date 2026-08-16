import type { ConnectorType, StationWithDistance } from '@/types/domain'

/** Filter model (spec 26). */
export interface StationFilters {
  connectors: ConnectorType[]
  minPowerKw: number | null
  /** Maximum €/kWh; `'free'` keeps only free stations. */
  maxPricePerKwh: number | null
  onlyFree: boolean
  /** Whether stations without a known price survive a price filter (spec 26.3). */
  includeUnknownPrice: boolean
  paymentCreditCard: boolean
  paymentPayAsYouGo: boolean
  accessAlwaysOpen: boolean
  accessPmr: boolean
  accessFree: boolean
}

export const DEFAULT_FILTERS: StationFilters = {
  connectors: [],
  minPowerKw: null,
  maxPricePerKwh: null,
  onlyFree: false,
  includeUnknownPrice: false,
  paymentCreditCard: false,
  paymentPayAsYouGo: false,
  accessAlwaysOpen: false,
  accessPmr: false,
  accessFree: false,
}

export const POWER_PRESETS = [22, 50, 100, 150, 250] as const
export const PRICE_PRESETS = [0.3, 0.4, 0.5, 0.6] as const

function isAlwaysOpen(hours: string | undefined): boolean {
  if (!hours) return false
  const normalized = hours.toLowerCase().replace(/\s/g, '')
  return normalized.includes('24/7') || normalized.includes('24h/24')
}

function isFreeAccess(condition: string | undefined): boolean {
  if (!condition) return false
  return condition.toLowerCase().includes('libre')
}

export function isFreeStation(station: StationWithDistance): boolean {
  if (station.payment.free === true) return true
  return station.pricing.energyPricePerKwh === 0 && station.pricing.confidence !== 'unknown'
}

/** Applies every active filter (spec 26). */
export function filterStations(
  stations: readonly StationWithDistance[],
  filters: StationFilters,
): StationWithDistance[] {
  return stations.filter((station) => {
    if (filters.connectors.length > 0) {
      const matches = filters.connectors.some((connector) => station.connectors.includes(connector))
      if (!matches) return false
    }

    if (filters.minPowerKw !== null && station.maxPowerKw < filters.minPowerKw) return false

    if (filters.onlyFree && !isFreeStation(station)) return false

    if (filters.maxPricePerKwh !== null) {
      const price = station.pricing.energyPricePerKwh
      if (price === undefined) {
        // A station with no known price cannot satisfy "≤ X €/kWh" (spec 26.3).
        if (!filters.includeUnknownPrice) return false
      } else if (price > filters.maxPricePerKwh) {
        return false
      }
    }

    if (filters.paymentCreditCard && station.payment.creditCard !== true) return false
    if (filters.paymentPayAsYouGo && station.payment.payAsYouGo !== true) return false

    if (filters.accessAlwaysOpen && !isAlwaysOpen(station.access.openingHours)) return false
    if (filters.accessPmr && station.access.pmr !== true) return false
    if (filters.accessFree && !isFreeAccess(station.access.condition)) return false

    return true
  })
}

export function countActiveFilters(filters: StationFilters): number {
  let count = 0
  if (filters.connectors.length > 0) count += 1
  if (filters.minPowerKw !== null) count += 1
  if (filters.maxPricePerKwh !== null || filters.onlyFree) count += 1
  if (filters.paymentCreditCard) count += 1
  if (filters.paymentPayAsYouGo) count += 1
  if (filters.accessAlwaysOpen) count += 1
  if (filters.accessPmr) count += 1
  if (filters.accessFree) count += 1
  return count
}
