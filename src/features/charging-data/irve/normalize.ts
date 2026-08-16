import { isValidCoordinate } from '@/lib/geo/coordinates'
import { parseIrvePrice } from '@/features/pricing/parse-irve-price'
import type {
  ChargingPrice,
  ConnectorType,
  DataQuality,
  EVSE,
  PaymentCapabilities,
} from '@/types/domain'
import type { IrveRow } from './types'

/** A single IRVE row turned into a usable point de charge. */
export interface NormalizedRow {
  stationKey: string
  stationItineranceId?: string
  stationLocalId?: string
  stationName: string
  operatorName?: string
  networkName?: string
  amenagerName?: string

  latitude: number
  longitude: number
  /** True when the position comes from the consolidated columns of the dataset. */
  coordinatesConsolidated: boolean
  address?: string
  city?: string
  postalCode?: string

  evse: EVSE

  declaredPdcCount?: number

  payment: PaymentCapabilities
  rawTariff?: string

  accessCondition?: string
  openingHours?: string
  reservation?: boolean
  pmr: boolean | null

  updatedAt?: string
}

const trim = (value: unknown): string | undefined => {
  if (typeof value === 'number') return String(value)
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length === 0 ? undefined : trimmed
}

/** IRVE booleans arrive as real booleans, `"true"/"false"`, or `1/0`. */
export function toBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') {
    if (value === 1) return true
    if (value === 0) return false
    return null
  }
  if (typeof value !== 'string') return null
  const normalized = value.trim().toLowerCase()
  if (['true', 'vrai', 'oui', '1', 'yes'].includes(normalized)) return true
  if (['false', 'faux', 'non', '0', 'no'].includes(normalized)) return false
  return null
}

export function toNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value !== 'string') return null
  const parsed = Number.parseFloat(value.trim().replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * Extracts [longitude, latitude].
 *
 * The dataset ships this field in several shapes over time: a real array, a
 * JSON string `"[2.35, 48.85]"`, or a WKT-ish `"POINT(2.35 48.85)"`.
 */
export function parseCoordinates(value: unknown): { longitude: number; latitude: number } | null {
  if (Array.isArray(value) && value.length >= 2) {
    const longitude = toNumber(value[0])
    const latitude = toNumber(value[1])
    if (longitude !== null && latitude !== null) return { longitude, latitude }
    return null
  }
  if (typeof value !== 'string') return null

  const text = value.trim()
  const pointMatch = /^point\s*\(\s*(-?[\d.]+)[\s,]+(-?[\d.]+)\s*\)$/i.exec(text)
  if (pointMatch) {
    const longitude = toNumber(pointMatch[1])
    const latitude = toNumber(pointMatch[2])
    if (longitude !== null && latitude !== null) return { longitude, latitude }
    return null
  }

  const cleaned = text.replace(/[[\]()]/g, '')
  const parts = cleaned.split(/[;,\s]+/).filter(Boolean)
  if (parts.length < 2) return null
  const longitude = toNumber(parts[0])
  const latitude = toNumber(parts[1])
  if (longitude === null || latitude === null) return null
  return { longitude, latitude }
}

/** Union of the connector flags carried by one row. */
export function connectorsFromRow(row: IrveRow): ConnectorType[] {
  const connectors: ConnectorType[] = []
  if (toBoolean(row.prise_type_combo_ccs)) connectors.push('CCS')
  if (toBoolean(row.prise_type_2)) connectors.push('TYPE_2')
  if (toBoolean(row.prise_type_chademo)) connectors.push('CHADEMO')
  if (toBoolean(row.prise_type_ef)) connectors.push('DOMESTIC')
  if (toBoolean(row.prise_type_autre)) connectors.push('OTHER')
  return connectors
}

/** PMR accessibility is a free-text enum in the schema. */
export function parsePmr(value: unknown): boolean | null {
  const text = trim(value)?.toLowerCase()
  if (!text) return null
  if (text.includes('inconnu') || text.includes('non renseign')) return null
  if (text.startsWith('accessible')) return true
  if (text.includes('non accessible')) return false
  return null
}

/** Values the dataset uses in `id_station_itinerance` when the id is missing. */
const INVALID_ID_VALUES = new Set([
  'non concerne',
  'non concerné',
  'inconnu',
  'na',
  'n/a',
  'nc',
  '-',
  'null',
])

function isUsableId(value: string | undefined): value is string {
  if (!value) return false
  return !INVALID_ID_VALUES.has(value.toLowerCase())
}

/**
 * Stable grouping key.
 *
 * Prefers `id_station_itinerance` (spec 9.1), falls back to the local id, and
 * finally to a name + rounded position key so rows with a broken id still form
 * a coherent station instead of hundreds of one-EVSE ghosts.
 */
export function stationKeyFor(
  row: IrveRow,
  latitude: number,
  longitude: number,
): { key: string; itineranceId?: string; localId?: string } {
  const itineranceId = trim(row.id_station_itinerance)
  const localId = trim(row.id_station_local)

  if (isUsableId(itineranceId)) {
    return { key: `itin:${itineranceId}`, itineranceId, localId }
  }
  if (isUsableId(localId)) {
    const operator = trim(row.nom_operateur) ?? trim(row.nom_amenageur) ?? ''
    return { key: `local:${operator.toLowerCase()}:${localId}`, localId }
  }
  const name = (trim(row.nom_station) ?? 'station').toLowerCase()
  const geoKey = `${latitude.toFixed(5)},${longitude.toFixed(5)}`
  return { key: `geo:${name}:${geoKey}` }
}

/** Builds the price object, keeping the raw text whatever the outcome (spec 8.5). */
export function priceFromRow(row: IrveRow): ChargingPrice {
  const raw = trim(row.tarification)
  const free = toBoolean(row.gratuit)
  const updatedAt = trim(row.date_maj)

  const base: ChargingPrice = {
    raw,
    currency: 'EUR',
    confidence: 'unknown',
    sourceLabel: 'Données IRVE',
    updatedAt,
  }

  const parsed = parseIrvePrice(raw)

  // The structured `gratuit` flag is a boolean column of the schema, so it is a
  // stronger signal than anything parsed out of free text.
  if (free === true && parsed.confidence !== 'low') {
    return { ...base, energyPricePerKwh: 0, sessionFee: 0, confidence: 'parsed' }
  }
  if (free === true && !raw) {
    return { ...base, energyPricePerKwh: 0, sessionFee: 0, confidence: 'parsed' }
  }

  if (parsed.confidence === 'low') return base

  // A bare number has no published unit: we assume €/kWh, so the value is an
  // estimate, never a published price (spec 58).
  const price: ChargingPrice = { ...base, confidence: parsed.assumedUnit ? 'estimated' : 'parsed' }
  if (parsed.energyPricePerKwh !== undefined) price.energyPricePerKwh = parsed.energyPricePerKwh
  if (parsed.sessionFee !== undefined) price.sessionFee = parsed.sessionFee
  if (parsed.minuteFee !== undefined) price.minuteFee = parsed.minuteFee

  // A tariff made only of a session or minute fee cannot price a charge.
  if (price.energyPricePerKwh === undefined) return base

  return price
}

export function paymentFromRow(row: IrveRow): PaymentCapabilities {
  return {
    payAsYouGo: toBoolean(row.paiement_acte),
    creditCard: toBoolean(row.paiement_cb),
    other: toBoolean(row.paiement_autre),
    free: toBoolean(row.gratuit),
  }
}

/** Assesses how much of the row we can actually trust (spec 8.6). */
export function qualityFor(input: {
  price: ChargingPrice
  hasAddress: boolean
  coordinatesTrusted: boolean
  hasPower: boolean
  hasConnectors: boolean
}): DataQuality {
  const warnings: string[] = []

  const location: DataQuality['location'] = input.coordinatesTrusted
    ? input.hasAddress
      ? 'good'
      : 'partial'
    : 'partial'
  if (!input.coordinatesTrusted) {
    warnings.push('Position issue des données publiées, non vérifiée.')
  }

  let pricing: DataQuality['pricing'] = 'unknown'
  if (input.price.confidence === 'exact') pricing = 'good'
  else if (input.price.confidence === 'parsed' || input.price.confidence === 'estimated') {
    pricing = 'partial'
  }

  if (input.price.confidence === 'unknown' && input.price.raw) {
    warnings.push("Le tarif publié n'a pas pu être interprété automatiquement.")
  }
  if (!input.hasPower) warnings.push('Puissance non renseignée dans les données publiées.')
  if (!input.hasConnectors) warnings.push('Type de prise non renseigné dans les données publiées.')

  return {
    location,
    pricing,
    // No browser-reachable real-time feed in the MVP (spec 50).
    availability: 'unknown',
    warnings,
  }
}

/**
 * Normalises one raw IRVE row.
 * Returns `null` when the row cannot be placed on a map (spec 9.4).
 */
export function normalizeRow(row: IrveRow): NormalizedRow | null {
  const consolidatedLat = toNumber(row.consolidated_latitude)
  const consolidatedLon = toNumber(row.consolidated_longitude)

  let latitude = consolidatedLat
  let longitude = consolidatedLon
  let coordinatesConsolidated = isValidCoordinate(latitude, longitude)

  if (!coordinatesConsolidated) {
    const fallback = parseCoordinates(row.coordonneesXY)
    if (fallback) {
      latitude = fallback.latitude
      longitude = fallback.longitude
      coordinatesConsolidated = false
    }
  }

  if (latitude === null || longitude === null || !isValidCoordinate(latitude, longitude)) {
    return null
  }

  const { key, itineranceId, localId } = stationKeyFor(row, latitude, longitude)

  const power = toNumber(row.puissance_nominale)
  // A handful of rows express power in watts (e.g. 22000): rescale them.
  const powerKw = power === null ? 0 : power > 1000 ? power / 1000 : Math.max(0, power)

  const evseId =
    trim(row.id_pdc_itinerance) ??
    trim(row.id_pdc_local) ??
    `${key}:${powerKw}:${latitude.toFixed(5)},${longitude.toFixed(5)}`

  const evse: EVSE = {
    id: evseId,
    localId: trim(row.id_pdc_local),
    powerKw,
    connectors: connectorsFromRow(row),
    status: 'UNKNOWN',
  }

  const postal = trim(row.consolidated_code_postal)

  return {
    stationKey: key,
    stationItineranceId: itineranceId,
    stationLocalId: localId,
    stationName: trim(row.nom_station) ?? trim(row.nom_enseigne) ?? 'Station de recharge',
    operatorName: trim(row.nom_operateur),
    networkName: trim(row.nom_enseigne),
    amenagerName: trim(row.nom_amenageur),

    latitude,
    longitude,
    coordinatesConsolidated,
    address: trim(row.adresse_station),
    city: trim(row.consolidated_commune),
    postalCode: postal,

    evse,

    declaredPdcCount: toNumber(row.nbre_pdc) ?? undefined,

    payment: paymentFromRow(row),
    rawTariff: trim(row.tarification),

    accessCondition: trim(row.condition_acces),
    openingHours: trim(row.horaires),
    reservation: toBoolean(row.reservation) ?? undefined,
    pmr: parsePmr(row.accessibilite_pmr),

    updatedAt: trim(row.date_maj),
  }
}
