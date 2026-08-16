import { useMemo } from 'react'
import { Banner, Button, Tag } from '@/components/ui'
import { RawTariffBlock } from '@/features/pricing/PriceDisplay'
import {
  calculateChargeCost,
  effectivePowerKw,
  estimateChargingMinutes,
} from '@/features/pricing/calculate-charge-cost'
import {
  buildNavigationUrl,
  NAVIGATION_APPS,
  NAVIGATION_APP_LABELS,
} from '@/features/navigation/deep-links'
import { useActiveVehicle, useSettingsStore } from '@/features/settings/settings-store'
import {
  formatDate,
  formatDistanceKm,
  formatDuration,
  formatEnergyKwh,
  formatEstimatedEuros,
  formatPowerKw,
  formatPricePerKwh,
  formatStraightLineDistance,
  pluralize,
  UNKNOWN_PRICE_LABEL,
} from '@/lib/format'
import { CONNECTOR_LABELS, type StationWithDistance } from '@/types/domain'
import './station-detail.css'

/** Station detail (spec 22). */
export function StationDetail({
  station,
  requestedKwh,
}: {
  station: StationWithDistance
  requestedKwh: number
}) {
  const vehicle = useActiveVehicle()
  const preferredApp = useSettingsStore((state) => state.settings.preferredNavigationApp)

  const usablePower = effectivePowerKw(station.maxPowerKw, station.connectors, vehicle)
  const chargingMinutes = estimateChargingMinutes(requestedKwh, usablePower)

  const cost = useMemo(
    () =>
      calculateChargeCost({
        price: station.pricing,
        requestedKwh,
        estimatedMinutes: chargingMinutes,
      }),
    [station.pricing, requestedKwh, chargingMinutes],
  )

  const orderedApps = useMemo(() => {
    if (!preferredApp) return NAVIGATION_APPS
    return [preferredApp, ...NAVIGATION_APPS.filter((app) => app !== preferredApp)]
  }, [preferredApp])

  const updated = formatDate(station.updatedAt)
  const datasetUpdated = formatDate(station.source.datasetUpdatedAt)

  return (
    <article className="station-detail">
      {/* --- Résumé --------------------------------------------------------- */}
      <section aria-labelledby="detail-summary">
        <h2 id="detail-summary" className="visually-hidden">
          Résumé
        </h2>
        <h1 className="station-detail__name">{station.name}</h1>
        {station.operatorName ? (
          <p className="station-detail__operator">{station.operatorName}</p>
        ) : null}
        {station.location.address ? (
          <p className="station-detail__address">
            {station.location.address}
            {station.location.city ? `, ${station.location.city}` : ''}
          </p>
        ) : null}

        <dl className="station-detail__facts">
          <div>
            <dt>Puissance maximale</dt>
            <dd>{formatPowerKw(station.maxPowerKw)}</dd>
          </div>
          {vehicle && usablePower < station.maxPowerKw ? (
            <div>
              <dt>Avec {vehicle.label}</dt>
              <dd>{formatPowerKw(usablePower)} utilisables</dd>
            </div>
          ) : null}
          <div>
            <dt>Points de charge</dt>
            <dd>
              {station.evses.length} {pluralize(station.evses.length, 'point')}
            </dd>
          </div>
          <div>
            <dt>Distance</dt>
            <dd>
              {station.routeDistanceKm !== undefined
                ? `${formatDistanceKm(station.routeDistanceKm)} par la route`
                : formatStraightLineDistance(station.straightLineDistanceKm)}
              {station.routeDurationMin !== undefined
                ? ` · ${formatDuration(station.routeDurationMin)}`
                : ''}
            </dd>
          </div>
          {station.detourDurationMin !== undefined ? (
            <div>
              <dt>Détour</dt>
              <dd>
                +{formatDuration(Math.max(0, station.detourDurationMin))}
                {station.detourDistanceKm !== undefined
                  ? ` · +${formatDistanceKm(Math.max(0, station.detourDistanceKm))}`
                  : ''}
              </dd>
            </div>
          ) : null}
        </dl>
      </section>

      {/* --- Recharge / coût ------------------------------------------------ */}
      <section aria-labelledby="detail-charge">
        <h2 id="detail-charge">Recharge</h2>
        <div className="cost-estimate">
          {cost.computable && cost.totalEur !== undefined ? (
            <>
              <p className="cost-estimate__amount">
                {formatEstimatedEuros(cost.totalEur)} pour {formatEnergyKwh(requestedKwh)}
              </p>
              {station.pricing.energyPricePerKwh !== undefined ? (
                <p className="cost-estimate__note">
                  {station.pricing.energyPricePerKwh === 0
                    ? 'Recharge annoncée gratuite.'
                    : `Sur la base de ${formatPricePerKwh(station.pricing.energyPricePerKwh)}`}
                  {station.pricing.sessionFee
                    ? ` et ${station.pricing.sessionFee.toFixed(2).replace('.', ',')} € par session`
                    : ''}
                  .
                </p>
              ) : null}
              {chargingMinutes !== undefined ? (
                <p className="cost-estimate__note">
                  Durée estimée : {formatDuration(chargingMinutes)} à {formatPowerKw(usablePower)}.
                  Estimation indicative, la courbe de charge réelle varie.
                </p>
              ) : null}
              {cost.warnings.map((warning) => (
                <p key={warning} className="cost-estimate__note">
                  {warning}
                </p>
              ))}
            </>
          ) : (
            <>
              <p className="cost-estimate__amount">{UNKNOWN_PRICE_LABEL}</p>
              <p className="cost-estimate__note">
                Le tarif publié ne permet pas de calculer un coût. Consultez le texte tarifaire
                ci-dessous.
              </p>
            </>
          )}
        </div>
      </section>

      {/* --- Prix ------------------------------------------------------------ */}
      <section aria-labelledby="detail-price">
        <h2 id="detail-price">Prix</h2>
        <RawTariffBlock price={station.pricing} />
      </section>

      {/* --- Connecteurs ----------------------------------------------------- */}
      <section aria-labelledby="detail-connectors">
        <h2 id="detail-connectors">Connecteurs</h2>
        {station.connectors.length > 0 ? (
          <ul className="station-detail__connectors">
            {station.connectors.map((connector) => (
              <li key={connector}>
                <Tag>{CONNECTOR_LABELS[connector]}</Tag>
              </li>
            ))}
          </ul>
        ) : (
          <p>Type de prise non renseigné dans les données publiées.</p>
        )}

        <table className="station-detail__table">
          <caption className="visually-hidden">Points de charge de la station</caption>
          <thead>
            <tr>
              <th scope="col">Point de charge</th>
              <th scope="col">Puissance</th>
              <th scope="col">Prises</th>
            </tr>
          </thead>
          <tbody>
            {station.evses.slice(0, 24).map((evse) => (
              <tr key={evse.id}>
                <td>{evse.localId ?? evse.id}</td>
                <td>{formatPowerKw(evse.powerKw)}</td>
                <td>
                  {evse.connectors.length > 0
                    ? evse.connectors.map((connector) => CONNECTOR_LABELS[connector]).join(', ')
                    : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="station-detail__note">
          Le nombre de points de charge n’indique pas combien sont disponibles maintenant.
        </p>
      </section>

      {/* --- Accès ----------------------------------------------------------- */}
      <section aria-labelledby="detail-access">
        <h2 id="detail-access">Accès</h2>
        <dl className="station-detail__facts">
          <div>
            <dt>Condition d’accès</dt>
            <dd>{station.access.condition ?? 'Non renseignée'}</dd>
          </div>
          <div>
            <dt>Horaires</dt>
            <dd>{station.access.openingHours ?? 'Non renseignés'}</dd>
          </div>
          <div>
            <dt>Accessibilité PMR</dt>
            <dd>
              {station.access.pmr === true
                ? 'Accessible'
                : station.access.pmr === false
                  ? 'Non accessible'
                  : 'Non renseignée'}
            </dd>
          </div>
          <div>
            <dt>Moyens de paiement</dt>
            <dd>
              {[
                station.payment.creditCard === true ? 'CB' : null,
                station.payment.payAsYouGo === true ? 'Paiement à l’acte' : null,
                station.payment.other === true ? 'Autre' : null,
                station.payment.free === true ? 'Gratuit' : null,
              ]
                .filter(Boolean)
                .join(', ') || 'Non renseignés'}
            </dd>
          </div>
        </dl>
      </section>

      {/* --- Navigation ------------------------------------------------------ */}
      <section aria-labelledby="detail-navigation">
        <h2 id="detail-navigation">Navigation</h2>
        <div className="row">
          {orderedApps.map((app, index) => (
            <a
              key={app}
              className={`button ${index === 0 ? 'button--primary' : ''}`}
              href={buildNavigationUrl(app, {
                latitude: station.location.latitude,
                longitude: station.location.longitude,
                name: station.name,
              })}
              target="_blank"
              rel="noopener noreferrer"
              data-testid={`nav-${app}`}
            >
              {NAVIGATION_APP_LABELS[app]}
            </a>
          ))}
        </div>
      </section>

      {/* --- Source ---------------------------------------------------------- */}
      <section aria-labelledby="detail-source">
        <h2 id="detail-source">Source des données</h2>
        <p>
          Source : {station.source.label}
          {updated ? ` · Mis à jour le ${updated}` : ''}
        </p>
        {datasetUpdated ? (
          <p className="station-detail__note">
            Jeu de données consolidé le {datasetUpdated}.
          </p>
        ) : null}
        {station.dataQuality.warnings.length > 0 ? (
          <Banner tone="warning" title="Limites de cette fiche">
            <ul>
              {station.dataQuality.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </Banner>
        ) : null}
        <div className="row">
          {station.source.url ? (
            <a
              className="button button--ghost"
              href={station.source.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              Consulter la source
            </a>
          ) : null}
          <Button
            variant="ghost"
            onClick={() => {
              const coords = `${station.location.latitude.toFixed(6)}, ${station.location.longitude.toFixed(6)}`
              void navigator.clipboard?.writeText(coords)
            }}
          >
            Copier les coordonnées
          </Button>
        </div>
      </section>
    </article>
  )
}
