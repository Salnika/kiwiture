import { create } from 'zustand'
import { DEFAULT_SEARCH_RADIUS_KM } from '@/config/constants'
import type { LatLng } from '@/lib/geo/coordinates'
import { readLocal, STORAGE_KEYS, writeLocal } from '@/lib/storage/local-storage'
import type { SortMode } from '@/types/domain'
import { readUserSettings } from '@/features/settings/settings-store'
import { countActiveFilters, DEFAULT_FILTERS, type StationFilters } from './filters/filters'

/**
 * UI / user state only (spec 40).
 * Server state — stations, routes, geocoding — belongs to TanStack Query and is
 * never duplicated here.
 */

export interface NamedPlace extends LatLng {
  label: string
}

export type SearchMode = 'around' | 'trip'

interface SearchState {
  /** Where we search from. `null` until geolocation or an address resolves. */
  origin: NamedPlace | null
  /** Optional destination enabling detour computation (spec 15.3). */
  destination: NamedPlace | null

  mode: SearchMode
  radiusKm: number

  filters: StationFilters
  sort: SortMode

  selectedStationId: string | null
  /** Station hovered in the list, highlighted on the map. */
  hoveredStationId: string | null

  /** Map viewport, kept out of Query so panning never refetches by accident. */
  viewport: { center: LatLng; zoom: number } | null

  setOrigin: (place: NamedPlace | null) => void
  setDestination: (place: NamedPlace | null) => void
  swapPlaces: () => void
  setMode: (mode: SearchMode) => void
  setRadiusKm: (radiusKm: number) => void

  setFilters: (patch: Partial<StationFilters>) => void
  resetFilters: () => void
  toggleConnector: (connector: StationFilters['connectors'][number]) => void

  setSort: (sort: SortMode) => void
  selectStation: (id: string | null) => void
  hoverStation: (id: string | null) => void
  setViewport: (viewport: { center: LatLng; zoom: number }) => void
}

function reviveFilters(value: unknown): StationFilters | null {
  if (typeof value !== 'object' || value === null) return null
  return { ...DEFAULT_FILTERS, ...(value as Partial<StationFilters>) }
}

function isPristine(filters: StationFilters): boolean {
  return countActiveFilters(filters) === 0
}

/**
 * Initial filters: the persisted ones, or — when the user never touched a
 * filter — the defaults declared in the settings screen (spec 27).
 */
function initialFilters(): StationFilters {
  const persisted = readLocal(STORAGE_KEYS.filters, DEFAULT_FILTERS, reviveFilters)
  if (!isPristine(persisted)) return persisted

  const settings = readUserSettings()
  return {
    ...persisted,
    connectors: settings.defaultConnector ? [settings.defaultConnector] : persisted.connectors,
    minPowerKw: settings.defaultMinPowerKw ?? persisted.minPowerKw,
  }
}

export const useSearchStore = create<SearchState>((set, get) => ({
  origin: null,
  destination: null,
  mode: 'around',
  radiusKm: DEFAULT_SEARCH_RADIUS_KM,
  filters: initialFilters(),
  sort: readUserSettings().defaultSort,
  selectedStationId: null,
  hoveredStationId: null,
  viewport: null,

  setOrigin: (place) => set({ origin: place }),
  setDestination: (place) =>
    set({ destination: place, mode: place ? 'trip' : 'around' }),

  swapPlaces: () => {
    const { origin, destination } = get()
    set({ origin: destination, destination: origin })
  },

  setMode: (mode) => set({ mode }),
  setRadiusKm: (radiusKm) => set({ radiusKm }),

  setFilters: (patch) => {
    const filters = { ...get().filters, ...patch }
    writeLocal(STORAGE_KEYS.filters, filters)
    set({ filters })
  },

  resetFilters: () => {
    writeLocal(STORAGE_KEYS.filters, DEFAULT_FILTERS)
    set({ filters: DEFAULT_FILTERS })
  },

  toggleConnector: (connector) => {
    const current = get().filters.connectors
    const connectors = current.includes(connector)
      ? current.filter((item) => item !== connector)
      : [...current, connector]
    get().setFilters({ connectors })
  },

  setSort: (sort) => set({ sort }),
  selectStation: (selectedStationId) => set({ selectedStationId }),
  hoverStation: (hoveredStationId) => set({ hoveredStationId }),
  setViewport: (viewport) => set({ viewport }),
}))
