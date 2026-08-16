/** Small typed localStorage wrapper — never throws (spec 27). */

export function readLocal<T>(key: string, fallback: T, revive?: (value: unknown) => T | null): T {
  if (typeof localStorage === 'undefined') return fallback
  try {
    const raw = localStorage.getItem(key)
    if (raw === null) return fallback
    const parsed: unknown = JSON.parse(raw)
    if (revive) {
      const revived = revive(parsed)
      return revived ?? fallback
    }
    return parsed as T
  } catch {
    return fallback
  }
}

export function writeLocal(key: string, value: unknown): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Quota exceeded or storage disabled: preferences are a nice-to-have.
  }
}

export function removeLocal(key: string): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.removeItem(key)
  } catch {
    /* ignore */
  }
}

export const STORAGE_KEYS = {
  settings: 'kiwiture:settings:v1',
  vehicles: 'kiwiture:vehicles:v1',
  activeVehicle: 'kiwiture:active-vehicle:v1',
  filters: 'kiwiture:filters:v1',
} as const
