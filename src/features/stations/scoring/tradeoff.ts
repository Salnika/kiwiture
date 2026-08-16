import { calculateChargeCost } from '@/features/pricing/calculate-charge-cost'
import type { StationWithDistance } from '@/types/domain'
import { rankingDurationMin } from './score-stations'

/**
 * Cost versus time comparison (spec 25).
 *
 * Answers "is the more expensive station worth the minutes it saves?" — and stays
 * silent whenever either price is too uncertain to compare honestly.
 */

export interface StationTradeoff {
  extraCostEur: number
  timeSavedMin: number
}

export interface TradeoffRecommendation {
  /** Station recommended by the comparison. */
  recommended: StationWithDistance
  /** The station it is compared against (the cheapest one). */
  alternative: StationWithDistance
  tradeoff: StationTradeoff
  /** Cost per hour saved — the number behind the recommendation. */
  costPerHourSavedEur: number
}

/** Minimum time gap worth mentioning. */
const MIN_TIME_SAVED_MIN = 5

/** Above this, paying to save time stops being obviously worthwhile. */
const MAX_REASONABLE_COST_PER_HOUR_EUR = 30

function isComparable(station: StationWithDistance): boolean {
  return (
    station.pricing.energyPricePerKwh !== undefined &&
    (station.pricing.confidence === 'parsed' || station.pricing.confidence === 'exact')
  )
}

function costFor(station: StationWithDistance, requestedKwh: number): number | undefined {
  const estimate = calculateChargeCost({ price: station.pricing, requestedKwh })
  return estimate.computable ? estimate.totalEur : undefined
}

export function compareStations(
  a: StationWithDistance,
  b: StationWithDistance,
  requestedKwh: number,
): StationTradeoff | null {
  const costA = costFor(a, requestedKwh)
  const costB = costFor(b, requestedKwh)
  if (costA === undefined || costB === undefined) return null

  const timeA = rankingDurationMin(a)
  const timeB = rankingDurationMin(b)
  if (timeA === undefined || timeB === undefined) return null

  return { extraCostEur: costB - costA, timeSavedMin: timeA - timeB }
}

/**
 * Picks the station worth recommending among a result set.
 * Returns `null` when the data does not support a confident recommendation
 * (spec 25: "Ne pas afficher ce message si le prix est trop incertain").
 */
export function recommendTradeoff(
  stations: readonly StationWithDistance[],
  requestedKwh: number,
): TradeoffRecommendation | null {
  const comparable = stations.filter(
    (station) => isComparable(station) && rankingDurationMin(station) !== undefined,
  )
  if (comparable.length < 2) return null

  const cheapest = [...comparable].sort(
    (a, b) => (costFor(a, requestedKwh) ?? Infinity) - (costFor(b, requestedKwh) ?? Infinity),
  )[0]
  const fastest = [...comparable].sort(
    (a, b) => (rankingDurationMin(a) ?? Infinity) - (rankingDurationMin(b) ?? Infinity),
  )[0]

  if (!cheapest || !fastest || cheapest.id === fastest.id) return null

  const tradeoff = compareStations(cheapest, fastest, requestedKwh)
  if (!tradeoff) return null

  // `fastest` must genuinely save time, and cost more (otherwise it simply wins).
  if (tradeoff.timeSavedMin < MIN_TIME_SAVED_MIN) return null
  if (tradeoff.extraCostEur <= 0) return null

  const costPerHourSavedEur = (tradeoff.extraCostEur / tradeoff.timeSavedMin) * 60
  if (costPerHourSavedEur > MAX_REASONABLE_COST_PER_HOUR_EUR) return null

  return {
    recommended: fastest,
    alternative: cheapest,
    tradeoff,
    costPerHourSavedEur,
  }
}
