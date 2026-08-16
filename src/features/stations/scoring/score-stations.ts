import type { SortMode, StationWithDistance } from '@/types/domain'

/**
 * Explicit ranking (spec 24).
 *
 * Every dimension is normalised to [0, 1] against the current result set, then
 * combined with mode-specific weights. A missing price is never scored 0: its
 * weight is redistributed and a small uncertainty penalty applies instead
 * (spec 24.1).
 */

export interface ScoreWeights {
  price: number
  detour: number
  power: number
  payment: number
  quality: number
}

export const SCORE_WEIGHTS: Record<SortMode, ScoreWeights> = {
  recommended: { price: 0.35, detour: 0.3, power: 0.15, payment: 0.1, quality: 0.1 },
  price: { price: 0.7, detour: 0.2, power: 0, payment: 0, quality: 0.1 },
  detour: { price: 0.15, detour: 0.7, power: 0.1, payment: 0, quality: 0.05 },
  power: { price: 0.1, detour: 0.45, power: 0.35, payment: 0, quality: 0.1 },
}

/** Penalty applied to a station whose price we could not determine. */
const UNKNOWN_PRICE_PENALTY = 0.08

interface Range {
  min: number
  max: number
}

function rangeOf(values: readonly number[]): Range | null {
  const finite = values.filter((value) => Number.isFinite(value))
  if (finite.length === 0) return null
  return { min: Math.min(...finite), max: Math.max(...finite) }
}

/** 1 = best (lowest value), 0 = worst. Flat ranges score 1 for everyone. */
function normalizeLowerIsBetter(value: number, range: Range | null): number {
  if (range === null || !Number.isFinite(value)) return 0
  if (range.max === range.min) return 1
  return 1 - (value - range.min) / (range.max - range.min)
}

function normalizeHigherIsBetter(value: number, range: Range | null): number {
  if (range === null || !Number.isFinite(value)) return 0
  if (range.max === range.min) return 1
  return (value - range.min) / (range.max - range.min)
}

/** Distance used for ranking: detour if known, else road distance, else Haversine. */
export function rankingDistanceKm(station: StationWithDistance): number {
  if (station.detourDistanceKm !== undefined) return station.detourDistanceKm
  if (station.routeDistanceKm !== undefined) return station.routeDistanceKm
  return station.straightLineDistanceKm
}

/** Time cost used for ranking: detour minutes if known, else travel time. */
export function rankingDurationMin(station: StationWithDistance): number | undefined {
  if (station.detourDurationMin !== undefined) return station.detourDurationMin
  return station.routeDurationMin
}

function paymentScore(station: StationWithDistance): number {
  const { payment } = station
  if (payment.free === true) return 1
  let score = 0.35
  if (payment.creditCard === true) score += 0.4
  if (payment.payAsYouGo === true) score += 0.25
  return Math.min(1, score)
}

function qualityScore(station: StationWithDistance): number {
  const levels = { good: 1, partial: 0.55, unknown: 0.2 } as const
  const location = levels[station.dataQuality.location]
  const pricing = levels[station.dataQuality.pricing]
  const freshness = freshnessScore(station.updatedAt)
  return location * 0.35 + pricing * 0.4 + freshness * 0.25
}

/** Data older than two years is barely worth trusting. */
function freshnessScore(updatedAt: string | undefined): number {
  if (!updatedAt) return 0.3
  const time = Date.parse(updatedAt)
  if (Number.isNaN(time)) return 0.3
  const ageDays = (Date.now() - time) / 86_400_000
  if (ageDays <= 90) return 1
  if (ageDays >= 730) return 0.2
  return 1 - ((ageDays - 90) / (730 - 90)) * 0.8
}

export interface ScoredStation extends StationWithDistance {
  score: number
}

/** Scores and sorts a result set for the given mode (spec 24). */
export function scoreStations(
  stations: readonly StationWithDistance[],
  mode: SortMode,
): ScoredStation[] {
  const weights = SCORE_WEIGHTS[mode]

  const priceRange = rangeOf(
    stations
      .filter((station) => station.pricing.energyPricePerKwh !== undefined)
      .map((station) => station.pricing.energyPricePerKwh as number),
  )
  const distanceRange = rangeOf(stations.map(rankingDistanceKm))
  const powerRange = rangeOf(
    stations.map((station) => station.effectivePowerKw ?? station.maxPowerKw),
  )

  const scored = stations.map((station) => {
    const hasPrice = station.pricing.energyPricePerKwh !== undefined
    const priceValue = station.pricing.energyPricePerKwh ?? Number.NaN

    const priceComponent = hasPrice ? normalizeLowerIsBetter(priceValue, priceRange) : 0
    const detourComponent = normalizeLowerIsBetter(rankingDistanceKm(station), distanceRange)
    const powerComponent = normalizeHigherIsBetter(
      station.effectivePowerKw ?? station.maxPowerKw,
      powerRange,
    )
    const paymentComponent = paymentScore(station)
    const qualityComponent = qualityScore(station)

    // Redistribute the price weight instead of scoring an unknown price as zero.
    const effectiveWeights: ScoreWeights = hasPrice
      ? weights
      : redistributePriceWeight(weights)

    let score =
      priceComponent * effectiveWeights.price +
      detourComponent * effectiveWeights.detour +
      powerComponent * effectiveWeights.power +
      paymentComponent * effectiveWeights.payment +
      qualityComponent * effectiveWeights.quality

    if (!hasPrice) score = Math.max(0, score - UNKNOWN_PRICE_PENALTY)

    return { ...station, score }
  })

  scored.sort((a, b) => b.score - a.score || a.straightLineDistanceKm - b.straightLineDistanceKm)
  return scored
}

function redistributePriceWeight(weights: ScoreWeights): ScoreWeights {
  const remaining = weights.detour + weights.power + weights.payment + weights.quality
  if (remaining <= 0) return { ...weights, price: 0 }
  const factor = 1 / remaining
  return {
    price: 0,
    detour: weights.detour * factor,
    power: weights.power * factor,
    payment: weights.payment * factor,
    quality: weights.quality * factor,
  }
}

/** Sorts without scoring, for the explicit sort modes users expect. */
export function sortStations(
  stations: readonly StationWithDistance[],
  mode: SortMode,
): StationWithDistance[] {
  if (mode === 'recommended') return scoreStations(stations, mode)

  const copy = [...stations]

  switch (mode) {
    case 'price':
      // Known prices first, cheapest first; unknown prices keep their distance order.
      copy.sort((a, b) => {
        const priceA = a.pricing.energyPricePerKwh
        const priceB = b.pricing.energyPricePerKwh
        if (priceA === undefined && priceB === undefined) {
          return rankingDistanceKm(a) - rankingDistanceKm(b)
        }
        if (priceA === undefined) return 1
        if (priceB === undefined) return -1
        return priceA - priceB || rankingDistanceKm(a) - rankingDistanceKm(b)
      })
      return copy
    case 'detour':
      copy.sort((a, b) => rankingDistanceKm(a) - rankingDistanceKm(b))
      return copy
    case 'power':
      copy.sort(
        (a, b) =>
          (b.effectivePowerKw ?? b.maxPowerKw) - (a.effectivePowerKw ?? a.maxPowerKw) ||
          rankingDistanceKm(a) - rankingDistanceKm(b),
      )
      return copy
    default:
      return copy
  }
}
