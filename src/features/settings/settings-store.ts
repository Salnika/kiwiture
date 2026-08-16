import { create } from 'zustand'
import { DEFAULT_REQUESTED_KWH } from '@/config/constants'
import { readLocal, STORAGE_KEYS, writeLocal } from '@/lib/storage/local-storage'
import type { LocalVehicle, NavigationApp, UserSettings } from '@/types/domain'

/**
 * User preferences and local vehicles.
 * Everything lives in localStorage — no account, nothing leaves the device
 * (spec 27, 28, 34).
 */

const DEFAULT_SETTINGS: UserSettings = {
  defaultSort: 'recommended',
  requestedEnergyKwh: DEFAULT_REQUESTED_KWH,
  theme: 'system',
}

/** Guesses the platform's native maps app (spec 29). */
function defaultNavigationApp(): NavigationApp {
  if (typeof navigator === 'undefined') return 'google-maps'
  const ua = navigator.userAgent
  return /iPhone|iPad|iPod|Macintosh/.test(ua) ? 'apple-maps' : 'google-maps'
}

function reviveSettings(value: unknown): UserSettings | null {
  if (typeof value !== 'object' || value === null) return null
  const candidate = value as Partial<UserSettings>
  return {
    ...DEFAULT_SETTINGS,
    ...candidate,
    defaultSort: candidate.defaultSort ?? DEFAULT_SETTINGS.defaultSort,
    theme: candidate.theme ?? 'system',
  }
}

function reviveVehicles(value: unknown): LocalVehicle[] | null {
  if (!Array.isArray(value)) return null
  return value.filter(
    (item): item is LocalVehicle =>
      typeof item === 'object' &&
      item !== null &&
      typeof (item as LocalVehicle).id === 'string' &&
      typeof (item as LocalVehicle).batteryCapacityKwh === 'number',
  )
}

/**
 * Reads the persisted preferences without touching the store.
 * Lets other stores seed their initial state from the user's defaults.
 */
export function readUserSettings(): UserSettings {
  return readLocal(STORAGE_KEYS.settings, DEFAULT_SETTINGS, reviveSettings)
}

interface SettingsState {
  settings: UserSettings
  vehicles: LocalVehicle[]
  activeVehicleId: string | null

  updateSettings: (patch: Partial<UserSettings>) => void
  setRequestedEnergyKwh: (value: number) => void
  setNavigationApp: (app: NavigationApp) => void

  addVehicle: (vehicle: Omit<LocalVehicle, 'id'>) => LocalVehicle
  updateVehicle: (id: string, patch: Partial<Omit<LocalVehicle, 'id'>>) => void
  removeVehicle: (id: string) => void
  setActiveVehicle: (id: string | null) => void
  activeVehicle: () => LocalVehicle | null
}

const createId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `veh-${Date.now()}-${Math.round(Math.random() * 1e6)}`

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: {
    ...readUserSettings(),
    preferredNavigationApp: readUserSettings().preferredNavigationApp ?? defaultNavigationApp(),
  },
  vehicles: readLocal(STORAGE_KEYS.vehicles, [], reviveVehicles),
  activeVehicleId: readLocal<string | null>(STORAGE_KEYS.activeVehicle, null),

  updateSettings: (patch) => {
    const next = { ...get().settings, ...patch }
    writeLocal(STORAGE_KEYS.settings, next)
    set({ settings: next })
  },

  setRequestedEnergyKwh: (value) => {
    get().updateSettings({ requestedEnergyKwh: Math.max(1, Math.min(200, value)) })
  },

  setNavigationApp: (app) => {
    get().updateSettings({ preferredNavigationApp: app })
  },

  addVehicle: (vehicle) => {
    const created: LocalVehicle = { ...vehicle, id: createId() }
    const next = [...get().vehicles, created]
    writeLocal(STORAGE_KEYS.vehicles, next)
    writeLocal(STORAGE_KEYS.activeVehicle, created.id)
    set({ vehicles: next, activeVehicleId: created.id })
    return created
  },

  updateVehicle: (id, patch) => {
    const next = get().vehicles.map((vehicle) =>
      vehicle.id === id ? { ...vehicle, ...patch } : vehicle,
    )
    writeLocal(STORAGE_KEYS.vehicles, next)
    set({ vehicles: next })
  },

  removeVehicle: (id) => {
    const next = get().vehicles.filter((vehicle) => vehicle.id !== id)
    const activeVehicleId = get().activeVehicleId === id ? null : get().activeVehicleId
    writeLocal(STORAGE_KEYS.vehicles, next)
    writeLocal(STORAGE_KEYS.activeVehicle, activeVehicleId)
    set({ vehicles: next, activeVehicleId })
  },

  setActiveVehicle: (id) => {
    writeLocal(STORAGE_KEYS.activeVehicle, id)
    set({ activeVehicleId: id })
  },

  activeVehicle: () => {
    const { vehicles, activeVehicleId } = get()
    if (!activeVehicleId) return null
    return vehicles.find((vehicle) => vehicle.id === activeVehicleId) ?? null
  },
}))

/** Selector hook: the vehicle currently applied to power and cost estimates. */
export function useActiveVehicle(): LocalVehicle | null {
  const vehicles = useSettingsStore((state) => state.vehicles)
  const activeVehicleId = useSettingsStore((state) => state.activeVehicleId)
  if (!activeVehicleId) return null
  return vehicles.find((vehicle) => vehicle.id === activeVehicleId) ?? null
}
