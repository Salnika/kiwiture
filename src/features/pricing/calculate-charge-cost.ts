import type { ChargingPrice, ConnectorType, LocalVehicle } from '@/types/domain'

/** Result of a cost estimation. Never claims more precision than the source. */
export interface ChargeCostEstimate {
  /** Energy component, when an energy price is known. */
  energyCostEur?: number
  sessionFeeEur?: number
  /** Total of the components we could actually compute. */
  totalEur?: number
  /** True when time-based components exist but could not be evaluated. */
  partial: boolean
  /** Human-readable caveats to render next to the amount (spec 11.1 / 44). */
  warnings: string[]
  /** Whether an amount may be displayed at all. */
  computable: boolean
}

export interface ChargeCostInput {
  price: ChargingPrice
  requestedKwh: number
  /** Optional charging duration, only known when a vehicle+power are known. */
  estimatedMinutes?: number
}

/**
 * Estimates what a charge costs.
 *
 * Returns `computable: false` whenever the price is `unknown`: the UI must then
 * show the raw tariff text and nothing else (spec 45).
 */
export function calculateChargeCost(input: ChargeCostInput): ChargeCostEstimate {
  const { price, requestedKwh, estimatedMinutes } = input
  const warnings: string[] = []

  if (price.confidence === 'unknown' || price.energyPricePerKwh === undefined) {
    return { partial: true, computable: false, warnings: [] }
  }

  if (!Number.isFinite(requestedKwh) || requestedKwh <= 0) {
    return { partial: true, computable: false, warnings: [] }
  }

  const energyCostEur = requestedKwh * price.energyPricePerKwh
  const sessionFeeEur = price.sessionFee ?? 0

  let total = energyCostEur + sessionFeeEur
  let partial = false

  // Time-based components can only be added when a duration is known.
  const hasTimeComponent = (price.minuteFee ?? 0) > 0 || (price.parkingMinuteFee ?? 0) > 0

  if (hasTimeComponent) {
    if (estimatedMinutes !== undefined && estimatedMinutes > 0) {
      total += ((price.minuteFee ?? 0) + (price.parkingMinuteFee ?? 0)) * estimatedMinutes
    } else {
      partial = true
      warnings.push(
        'Ce tarif comporte une part au temps qui ne peut pas être calculée sans durée de recharge.',
      )
    }
  }

  if (price.confidence === 'parsed') {
    warnings.push('Estimation basée sur le tarif publié dans les données IRVE.')
  }
  if (price.confidence === 'estimated') {
    warnings.push('Estimation basée sur une donnée partielle.')
  }

  return {
    energyCostEur,
    sessionFeeEur: sessionFeeEur > 0 ? sessionFeeEur : undefined,
    totalEur: total,
    partial,
    warnings,
    computable: true,
  }
}

/** Energy needed to move from `currentSoc` to `targetSoc` (spec 11.2). */
export function energyForSocRange(
  batteryCapacityKwh: number,
  currentSoc: number,
  targetSoc: number,
): number {
  if (!Number.isFinite(batteryCapacityKwh) || batteryCapacityKwh <= 0) return 0
  const delta = Math.max(0, Math.min(100, targetSoc) - Math.max(0, currentSoc))
  return (batteryCapacityKwh * delta) / 100
}

/**
 * Power actually usable at a station with the selected vehicle (spec 12).
 *
 * `connectors` decides whether the DC or the AC ceiling applies: CCS and
 * CHAdeMO are DC, Type 2 and domestic sockets are AC.
 */
export function effectivePowerKw(
  stationPowerKw: number,
  connectors: readonly ConnectorType[],
  vehicle: LocalVehicle | null | undefined,
): number {
  if (!vehicle) return stationPowerKw

  const isDc = connectors.includes('CCS') || connectors.includes('CHADEMO')
  const ceiling = isDc ? vehicle.maxDcPowerKw : vehicle.maxAcPowerKw

  if (ceiling === undefined || !Number.isFinite(ceiling) || ceiling <= 0) return stationPowerKw
  return Math.min(stationPowerKw, ceiling)
}

/**
 * Rough charging duration for `kwh` at `powerKw`.
 *
 * Applies a 0.8 efficiency factor because real charging curves taper well before
 * the nominal power; this is explicitly an estimate, never a promise.
 */
export function estimateChargingMinutes(kwh: number, powerKw: number): number | undefined {
  if (!Number.isFinite(powerKw) || powerKw <= 0) return undefined
  if (!Number.isFinite(kwh) || kwh <= 0) return undefined
  return (kwh / (powerKw * 0.8)) * 60
}
