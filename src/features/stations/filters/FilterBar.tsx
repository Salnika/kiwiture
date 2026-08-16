import { useState } from 'react'
import { Button, Chip } from '@/components/ui'
import { CONNECTOR_LABELS, type ConnectorType, type SortMode } from '@/types/domain'
import { useSearchStore } from '../search-store'
import { countActiveFilters, POWER_PRESETS, PRICE_PRESETS } from './filters'
import './filters.css'

/** Quick filters and sort (spec 20, 26). */

const CONNECTORS: ConnectorType[] = ['CCS', 'TYPE_2', 'CHADEMO', 'DOMESTIC']

const SORT_OPTIONS: Array<{ value: SortMode; label: string }> = [
  { value: 'recommended', label: 'Recommandé' },
  { value: 'price', label: 'Prix' },
  { value: 'detour', label: 'Détour' },
  { value: 'power', label: 'Puissance' },
]

const formatPrice = (value: number) => `≤ ${value.toFixed(2).replace('.', ',')} €/kWh`

export function FilterBar() {
  const filters = useSearchStore((state) => state.filters)
  const setFilters = useSearchStore((state) => state.setFilters)
  const toggleConnector = useSearchStore((state) => state.toggleConnector)
  const resetFilters = useSearchStore((state) => state.resetFilters)
  const sort = useSearchStore((state) => state.sort)
  const setSort = useSearchStore((state) => state.setSort)

  const [expanded, setExpanded] = useState(false)
  const activeCount = countActiveFilters(filters)

  return (
    <div className="filters">
      <div className="filter-row" role="group" aria-label="Filtres rapides">
        <Chip active={filters.connectors.includes('CCS')} onClick={() => toggleConnector('CCS')}>
          CCS
        </Chip>
        <Chip
          active={filters.minPowerKw === 100}
          onClick={() => setFilters({ minPowerKw: filters.minPowerKw === 100 ? null : 100 })}
        >
          ≥ 100 kW
        </Chip>
        <Chip
          active={filters.paymentCreditCard}
          onClick={() => setFilters({ paymentCreditCard: !filters.paymentCreditCard })}
        >
          CB
        </Chip>
        <Chip
          active={filters.maxPricePerKwh === 0.6}
          onClick={() =>
            setFilters({ maxPricePerKwh: filters.maxPricePerKwh === 0.6 ? null : 0.6 })
          }
        >
          ≤ 0,60 €/kWh
        </Chip>
        <Chip active={expanded} onClick={() => setExpanded((value) => !value)} aria-expanded={expanded}>
          Filtres{activeCount > 0 ? ` (${activeCount})` : ''}
        </Chip>
      </div>

      {expanded ? (
        <div className="filters__panel">
          <fieldset className="filters__group">
            <legend className="filters__legend">Connecteurs</legend>
            <div className="filter-row">
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
            <div className="filter-row">
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
            <div className="filter-row">
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
            <div className="filter-row">
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
            <div className="filter-row">
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

          <Button variant="ghost" onClick={resetFilters} disabled={activeCount === 0}>
            Réinitialiser les filtres
          </Button>
        </div>
      ) : null}

      <div className="sort-row">
        <span className="sort-row__label" id="sort-label">
          Trier par
        </span>
        <div className="filter-row" role="group" aria-labelledby="sort-label">
          {SORT_OPTIONS.map((option) => (
            <Chip
              key={option.value}
              active={sort === option.value}
              onClick={() => setSort(option.value)}
            >
              {option.label}
            </Chip>
          ))}
        </div>
      </div>
    </div>
  )
}
