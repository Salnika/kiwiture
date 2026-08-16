import { useState } from 'react'
import { Chip } from '@/components/ui'
import { useSearchStore } from '../search-store'
import { countActiveFilters } from './filters'
import { FilterSheet } from './FilterSheet'
import './filters.css'

/**
 * Quick filters (spec 20): a single horizontally scrollable row, so the map
 * keeps the vertical space on a phone. Everything else opens in a sheet.
 */
export function FilterBar() {
  const filters = useSearchStore((state) => state.filters)
  const setFilters = useSearchStore((state) => state.setFilters)
  const toggleConnector = useSearchStore((state) => state.toggleConnector)

  const [sheetOpen, setSheetOpen] = useState(false)
  const activeCount = countActiveFilters(filters)

  return (
    <>
      <div className="filter-row" role="group" aria-label="Filtres rapides">
        <Chip
          className="filter-row__more"
          active={activeCount > 0}
          aria-haspopup="dialog"
          onClick={() => setSheetOpen(true)}
        >
          Filtres{activeCount > 0 ? ` · ${activeCount}` : ''}
        </Chip>
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
          onClick={() => setFilters({ maxPricePerKwh: filters.maxPricePerKwh === 0.6 ? null : 0.6 })}
        >
          ≤ 0,60 €/kWh
        </Chip>
      </div>

      <FilterSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />
    </>
  )
}
