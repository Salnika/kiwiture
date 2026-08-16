import { Chip } from '@/components/ui'
import { EnergyInput } from '@/features/pricing/EnergyInput'
import { pluralize } from '@/lib/format'
import type { SortMode } from '@/types/domain'
import { useSearchStore } from './search-store'
import './list-panel-header.css'

/**
 * Header of the results panel — the same markup serves the desktop column and
 * the mobile bottom sheet, so the sort and the energy input exist exactly once.
 */

const SORT_OPTIONS: Array<{ value: SortMode; label: string }> = [
  { value: 'recommended', label: 'Recommandé' },
  { value: 'price', label: 'Prix' },
  { value: 'detour', label: 'Détour' },
  { value: 'power', label: 'Puissance' },
]

export function ListPanelHeader({ count, loading }: { count: number; loading: boolean }) {
  const sort = useSearchStore((state) => state.sort)
  const setSort = useSearchStore((state) => state.setSort)

  return (
    <div className="list-header">
      <div className="list-header__top">
        <p className="list-header__count" aria-live="polite">
          {loading ? 'Recherche…' : `${count} ${pluralize(count, 'borne')}`}
        </p>
        <EnergyInput />
      </div>

      <div className="filter-row" role="group" aria-label="Trier les résultats">
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
  )
}
