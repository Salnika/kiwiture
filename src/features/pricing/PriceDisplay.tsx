import type { ChargingPrice, PriceConfidence } from '@/types/domain'
import { formatDate, formatPricePerKwh, UNKNOWN_PRICE_LABEL } from '@/lib/format'
import './pricing.css'

/**
 * Price rendering — the product's honesty contract (spec 44 / 58).
 *
 * Four vocabularies, never mixed:
 *   exact     → "Prix vérifié"  (no source guarantees this today)
 *   parsed    → "Prix publié"   (read from the IRVE free-text field)
 *   estimated → "Prix estimé"   (derived from partial data)
 *   unknown   → "Prix non disponible"
 */

export const CONFIDENCE_LABELS: Record<PriceConfidence, string> = {
  exact: 'Prix vérifié',
  parsed: 'Prix publié',
  estimated: 'Prix estimé',
  unknown: 'Prix non disponible',
}

export const CONFIDENCE_EXPLANATIONS: Record<PriceConfidence, string> = {
  exact: 'Tarif garanti par une source structurée fiable.',
  parsed: 'Prix détecté dans les données publiées par l’opérateur.',
  estimated: 'Estimation calculée à partir d’une donnée partielle.',
  unknown: 'Aucun tarif exploitable n’a pu être déterminé.',
}

export function PriceBadge({ confidence }: { confidence: PriceConfidence }) {
  return (
    <span className={`price-badge price-badge--${confidence}`} title={CONFIDENCE_EXPLANATIONS[confidence]}>
      {CONFIDENCE_LABELS[confidence]}
    </span>
  )
}

/** Headline price of a station card. */
export function PriceHeadline({ price }: { price: ChargingPrice }) {
  if (price.energyPricePerKwh === undefined) {
    return (
      <p className="price-headline price-headline--unknown">
        <span className="price-headline__value">{UNKNOWN_PRICE_LABEL}</span>
      </p>
    )
  }

  if (price.energyPricePerKwh === 0) {
    return (
      <p className="price-headline price-headline--free">
        <span className="price-headline__value">Recharge gratuite</span>
      </p>
    )
  }

  return (
    <p className="price-headline">
      <span className="price-headline__value">{formatPricePerKwh(price.energyPricePerKwh)}</span>
      {price.sessionFee ? (
        <span className="price-headline__extra">
          {' '}
          + {price.sessionFee.toFixed(2).replace('.', ',')} € par session
        </span>
      ) : null}
    </p>
  )
}

/**
 * Raw tariff text, always displayed on the detail screen — even when a price was
 * successfully parsed (spec 22.2).
 */
export function RawTariffBlock({ price }: { price: ChargingPrice }) {
  const updated = formatDate(price.updatedAt)
  return (
    <section className="raw-tariff" aria-labelledby="raw-tariff-title">
      <h3 id="raw-tariff-title" className="raw-tariff__title">
        Information tarifaire publiée
      </h3>
      {price.raw ? (
        // Rendered as text by React — IRVE data is never injected as HTML (spec 33.3).
        <blockquote className="raw-tariff__quote">{price.raw}</blockquote>
      ) : (
        <p className="raw-tariff__empty">
          Aucun texte tarifaire n’est publié pour cette station dans les données IRVE.
        </p>
      )}
      <p className="raw-tariff__meta">
        <PriceBadge confidence={price.confidence} />
        {updated ? <span> · Donnée mise à jour le {updated}</span> : null}
      </p>
      <p className="raw-tariff__meta raw-tariff__meta--muted">
        {CONFIDENCE_EXPLANATIONS[price.confidence]}
      </p>
    </section>
  )
}
