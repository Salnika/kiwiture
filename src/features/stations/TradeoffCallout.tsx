import { useMemo } from 'react'
import { formatDuration, formatEstimatedEuros } from '@/lib/format'
import type { StationWithDistance } from '@/types/domain'
import { recommendTradeoff } from './scoring/tradeoff'
import '@/features/pricing/pricing.css'

/**
 * Cost versus time callout (spec 25).
 * Renders nothing when the prices involved are too uncertain to compare.
 */
export function TradeoffCallout({
  stations,
  requestedKwh,
}: {
  stations: readonly StationWithDistance[]
  requestedKwh: number
}) {
  const recommendation = useMemo(
    () => recommendTradeoff(stations, requestedKwh),
    [stations, requestedKwh],
  )

  if (!recommendation) return null

  const { recommended, alternative, tradeoff } = recommendation

  return (
    <aside className="tradeoff" aria-label="Comparaison coût et temps">
      <p className="tradeoff__title">{recommended.name} recommandée</p>
      <p className="tradeoff__metrics">
        <span>
          <strong>+{formatEstimatedEuros(tradeoff.extraCostEur).replace('≈ ', '')}</strong> de plus
        </span>
        <span>
          <strong>{formatDuration(tradeoff.timeSavedMin)}</strong> gagnées
        </span>
      </p>
      <p className="tradeoff__note">
        Comparé à {alternative.name}, la moins chère pour {requestedKwh} kWh. Estimations basées sur
        les tarifs publiés dans les données IRVE.
      </p>
    </aside>
  )
}
