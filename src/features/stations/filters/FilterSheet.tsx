import { Button, Chip } from '@/components/ui'
import { ModalSheet } from '@/components/ModalSheet'
import { CONNECTOR_LABELS, type ConnectorType } from '@/types/domain'
import { useSearchStore } from '../search-store'
import { countActiveFilters, POWER_PRESETS, PRICE_PRESETS } from './filters'
import './filters.css'

/**
 * Full filter set (spec 26), inside a modal sheet.
 *
 * On phones an inline panel would push the map and the list off screen, so the
 * detailed filters live in an overlay instead.
 */

const CONNECTORS: ConnectorType[] = ['CCS', 'TYPE_2', 'CHADEMO', 'DOMESTIC']

const formatPrice = (value: number) => `≤ ${value.toFixed(2).replace('.', ',')} €/kWh`

export function FilterSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const filters = useSearchStore((state) => state.filters)
  const setFilters = useSearchStore((state) => state.setFilters)
  const toggleConnector = useSearchStore((state) => state.toggleConnector)
  const resetFilters = useSearchStore((state) => state.resetFilters)

  const activeCount = countActiveFilters(filters)

  return (
    <ModalSheet
      open={open}
      title="Filtres"
      onClose={onClose}
      footer={
        <>
          <Button onClick={resetFilters} disabled={activeCount === 0}>
            Réinitialiser
          </Button>
          <Button variant="primary" onClick={onClose}>
            Voir les résultats
          </Button>
        </>
      }
    >
      <div className="filters__groups">
        <fieldset className="filters__group">
          <legend className="filters__legend">Connecteurs</legend>
          <div className="filters__wrap">
            {CONNECTORS.map((connector) => (
              <Chip
                key={connector}
                active={filters.connectors.includes(connector)}
                onClick={() => toggleConnector(connector)}
              >
                {CONNECTOR_LABELS[connector]}
              </Chip>
            ))}
          </div>
        </fieldset>

        <fieldset className="filters__group">
          <legend className="filters__legend">Puissance minimale</legend>
          <div className="filters__wrap">
            {POWER_PRESETS.map((power) => (
              <Chip
                key={power}
                active={filters.minPowerKw === power}
                onClick={() =>
                  setFilters({ minPowerKw: filters.minPowerKw === power ? null : power })
                }
              >
                ≥ {power} kW
              </Chip>
            ))}
          </div>
        </fieldset>

        <fieldset className="filters__group">
          <legend className="filters__legend">Tarif</legend>
          <div className="filters__wrap">
            <Chip
              active={filters.onlyFree}
              onClick={() => setFilters({ onlyFree: !filters.onlyFree })}
            >
              Gratuit
            </Chip>
            {PRICE_PRESETS.map((price) => (
              <Chip
                key={price}
                active={filters.maxPricePerKwh === price}
                onClick={() =>
                  setFilters({ maxPricePerKwh: filters.maxPricePerKwh === price ? null : price })
                }
              >
                {formatPrice(price)}
              </Chip>
            ))}
          </div>
          <label className="filters__checkbox">
            <input
              type="checkbox"
              checked={filters.includeUnknownPrice}
              onChange={(event) => setFilters({ includeUnknownPrice: event.target.checked })}
            />
            <span>Inclure les prix inconnus</span>
          </label>
          <p className="filters__hint">
            Sans cette option, les bornes dont le tarif n’est pas déterminable sont exclues d’un
            filtre « ≤ X €/kWh ».
          </p>
        </fieldset>

        <fieldset className="filters__group">
          <legend className="filters__legend">Paiement</legend>
          <div className="filters__wrap">
            <Chip
              active={filters.paymentCreditCard}
              onClick={() => setFilters({ paymentCreditCard: !filters.paymentCreditCard })}
            >
              CB
            </Chip>
            <Chip
              active={filters.paymentPayAsYouGo}
              onClick={() => setFilters({ paymentPayAsYouGo: !filters.paymentPayAsYouGo })}
            >
              Paiement à l’acte
            </Chip>
          </div>
        </fieldset>

        <fieldset className="filters__group">
          <legend className="filters__legend">Accès</legend>
          <div className="filters__wrap">
            <Chip
              active={filters.accessAlwaysOpen}
              onClick={() => setFilters({ accessAlwaysOpen: !filters.accessAlwaysOpen })}
            >
              24/7
            </Chip>
            <Chip
              active={filters.accessPmr}
              onClick={() => setFilters({ accessPmr: !filters.accessPmr })}
            >
              PMR
            </Chip>
            <Chip
              active={filters.accessFree}
              onClick={() => setFilters({ accessFree: !filters.accessFree })}
            >
              Accès libre
            </Chip>
          </div>
        </fieldset>
      </div>
    </ModalSheet>
  )
}
