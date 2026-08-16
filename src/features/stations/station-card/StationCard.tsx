import { memo } from 'react'
import { CONNECTOR_LABELS, type StationWithDistance } from '@/types/domain'
import {
  formatDetourDistance,
  formatDetourDuration,
  formatDistanceKm,
  formatDuration,
  formatEnergyKwh,
  formatEstimatedEuros,
  formatPowerKw,
  formatStraightLineDistance,
  pluralize,
} from '@/lib/format'
import { PriceBadge, PriceHeadline } from '@/features/pricing/PriceDisplay'
import './station-card.css'

/**
 * Station card (spec 21).
 *
 * Visual priority, strictly in this order (spec 41):
 * price → detour → estimated cost → power → payment → operator.
 */

export interface StationCardProps {
  station: StationWithDistance
  requestedKwh: number
  selected?: boolean
  /** True when the routing provider answered for this station. */
  routed?: boolean
  onSelect: (id: string) => void
  onOpenDetail: (id: string) => void
  onHover?: (id: string | null) => void
}

function DistanceLine({ station, routed }: { station: StationWithDistance; routed: boolean }) {
  // Detour is the most actionable figure when a destination is set (spec 15.3).
  if (station.detourDurationMin !== undefined) {
    return (
      <p className="station-card__distance">
        <strong>{formatDetourDuration(station.detourDurationMin)}</strong>
        {station.detourDistanceKm !== undefined ? (
          <span> · {formatDetourDistance(station.detourDistanceKm)}</span>
        ) : null}
        <span className="station-card__distance-note"> de détour</span>
      </p>
    )
  }

  if (station.routeDistanceKm !== undefined) {
    return (
      <p className="station-card__distance">
        <strong>{formatDistanceKm(station.routeDistanceKm)}</strong>
        {station.routeDurationMin !== undefined ? (
          <span> · {formatDuration(station.routeDurationMin)}</span>
        ) : null}
        <span className="station-card__distance-note"> par la route</span>
      </p>
    )
  }

  return (
    <p className="station-card__distance station-card__distance--approx">
      {formatStraightLineDistance(station.straightLineDistanceKm)}
      {routed ? null : (
        <span className="station-card__distance-note"> · distance routière indisponible</span>
      )}
    </p>
  )
}

function StationCardComponent({
  station,
  requestedKwh,
  selected = false,
  routed = false,
  onSelect,
  onOpenDetail,
  onHover,
}: StationCardProps) {
  const chargePoints = station.evses.length
  const powerLimited =
    station.effectivePowerKw !== undefined && station.effectivePowerKw < station.maxPowerKw

  return (
    <article
      className="station-card"
      data-selected={selected}
      data-testid="station-card"
      onMouseEnter={() => onHover?.(station.id)}
      onMouseLeave={() => onHover?.(null)}
    >
      <button
        type="button"
        className="station-card__hit"
        aria-pressed={selected}
        onClick={() => onSelect(station.id)}
      >
        <span className="visually-hidden">Sélectionner {station.name} sur la carte</span>
      </button>

      <div className="station-card__body">
        <header className="station-card__header">
          <h3 className="station-card__name">{station.name}</h3>
          {station.operatorName ? (
            <p className="station-card__operator">{station.operatorName}</p>
          ) : null}
        </header>

        <div className="station-card__price">
          <PriceHeadline price={station.pricing} />
          {station.estimatedCostEur !== undefined ? (
            <p className="station-card__cost">
              {formatEstimatedEuros(station.estimatedCostEur)} pour {formatEnergyKwh(requestedKwh)}
            </p>
          ) : null}
        </div>

        <DistanceLine station={station} routed={routed} />

        <div className="station-card__specs">
          <span className="station-card__spec">
            <strong>{formatPowerKw(station.maxPowerKw)}</strong>
            {powerLimited ? (
              <span className="station-card__spec-note">
                {' '}
                · {formatPowerKw(station.effectivePowerKw as number)} avec votre véhicule
              </span>
            ) : null}
          </span>
          <span className="station-card__spec">
            {chargePoints} {pluralize(chargePoints, 'point')} de charge
          </span>
        </div>

        <ul className="station-card__tags">
          {station.connectors.slice(0, 3).map((connector) => (
            <li key={connector} className="tag tag--muted">
              {CONNECTOR_LABELS[connector]}
            </li>
          ))}
          {station.payment.creditCard === true ? <li className="tag tag--muted">CB</li> : null}
          {station.payment.free === true ? <li className="tag tag--free">Gratuit</li> : null}
        </ul>

        <footer className="station-card__footer">
          <PriceBadge confidence={station.pricing.confidence} />
          <button
            type="button"
            className="station-card__detail"
            onClick={() => onOpenDetail(station.id)}
          >
            Détails
            <span className="visually-hidden"> de la station {station.name}</span>
          </button>
        </footer>
      </div>
    </article>
  )
}

export const StationCard = memo(StationCardComponent)
