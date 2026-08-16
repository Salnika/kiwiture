/**
 * French UX formatting (spec 43 / 44).
 *
 * Rules enforced here:
 *  - decimal comma, never a dot;
 *  - "≈" in front of every estimated amount;
 *  - "Prix non disponible" rather than "N/A".
 */

const LOCALE = 'fr-FR'

const numberFormatter = (min: number, max: number) =>
  new Intl.NumberFormat(LOCALE, { minimumFractionDigits: min, maximumFractionDigits: max })

const eurFormatter = new Intl.NumberFormat(LOCALE, {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export const UNKNOWN_PRICE_LABEL = 'Prix non disponible'

export function formatNumber(value: number, fractionDigits = 1): string {
  return numberFormatter(0, fractionDigits).format(value)
}

/** `0,49 €/kWh` */
export function formatPricePerKwh(value: number): string {
  return `${numberFormatter(2, 2).format(value)} €/kWh`
}

/** `14,73 €` */
export function formatEuros(value: number): string {
  return eurFormatter.format(value)
}

/** `≈ 14,73 €` — the only shape allowed for a computed cost (spec 44). */
export function formatEstimatedEuros(value: number): string {
  return `≈ ${eurFormatter.format(value)}`
}

/** `2,7 km` below 10 km, `12 km` above; `450 m` under a kilometre. */
export function formatDistanceKm(km: number): string {
  if (!Number.isFinite(km)) return '—'
  if (km < 1) return `${Math.round(km * 1000)} m`
  if (km < 10) return `${numberFormatter(0, 1).format(km)} km`
  return `${Math.round(km)} km`
}

/** `~ 4,2 km à vol d'oiseau` (spec 16). */
export function formatStraightLineDistance(km: number): string {
  return `~ ${formatDistanceKm(km)} à vol d'oiseau`
}

/** `8 min`, `1 h 12` */
export function formatDuration(minutes: number): string {
  if (!Number.isFinite(minutes)) return '—'
  const rounded = Math.round(minutes)
  if (rounded < 60) return `${rounded} min`
  const hours = Math.floor(rounded / 60)
  const rest = rounded % 60
  return rest === 0 ? `${hours} h` : `${hours} h ${String(rest).padStart(2, '0')}`
}

/** `+6 min`, `sur le trajet` when the detour is negligible. */
export function formatDetourDuration(minutes: number): string {
  const clamped = Math.max(0, minutes)
  if (clamped < 1) return 'Sur le trajet'
  return `+${formatDuration(clamped)}`
}

export function formatDetourDistance(km: number): string {
  const clamped = Math.max(0, km)
  if (clamped < 0.1) return '—'
  return `+${formatDistanceKm(clamped)}`
}

/** `300 kW`, `22 kW`, `3,7 kW` */
export function formatPowerKw(kw: number): string {
  if (!Number.isFinite(kw) || kw <= 0) return 'Puissance inconnue'
  if (kw < 10) return `${numberFormatter(0, 1).format(kw)} kW`
  return `${Math.round(kw)} kW`
}

export function formatEnergyKwh(kwh: number): string {
  return `${numberFormatter(0, 1).format(kwh)} kWh`
}

/** `15/08/2026` from an ISO-ish date string; null when unparseable. */
export function formatDate(value: string | undefined | null): string | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat(LOCALE, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date)
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return count > 1 ? plural : singular
}
