import type {
  ChargingPrice,
  ChargingStation,
  ConnectorType,
  DataSource,
  EVSE,
} from '@/types/domain'
import { normalizeRow, priceFromRow, qualityFor } from './normalize'
import type { NormalizedRow } from './normalize'
import type { IrveRow } from './types'
import { IRVE_SOURCE_LABEL, IRVE_TRANSPORT_PAGE_URL } from './types'

const CONNECTOR_ORDER: ConnectorType[] = ['CCS', 'CHADEMO', 'TYPE_2', 'DOMESTIC', 'OTHER']

function sortConnectors(connectors: Iterable<ConnectorType>): ConnectorType[] {
  return [...new Set(connectors)].sort(
    (a, b) => CONNECTOR_ORDER.indexOf(a) - CONNECTOR_ORDER.indexOf(b),
  )
}

/** Most recent ISO-ish date of the group, or undefined. */
function latestDate(values: Array<string | undefined>): string | undefined {
  let best: { value: string; time: number } | undefined
  for (const value of values) {
    if (!value) continue
    const time = Date.parse(value)
    if (Number.isNaN(time)) continue
    if (!best || time > best.time) best = { value, time }
  }
  return best?.value
}

/** Picks the first non-empty value of a column across the group. */
function firstDefined<T>(values: Array<T | undefined | null>): T | undefined {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== '') return value
  }
  return undefined
}

/** Majority value for a nullable boolean; null when the group disagrees or is silent. */
function consensusBoolean(values: Array<boolean | null>): boolean | null {
  const known = values.filter((value): value is boolean => value !== null)
  if (known.length === 0) return null
  // Any point de charge accepting the method makes the station accept it.
  return known.some(Boolean)
}

export interface GroupingOptions {
  source?: Partial<DataSource>
}

/**
 * Turns raw IRVE rows into stations (spec 9).
 *
 * Every row becomes one EVSE; rows sharing `id_station_itinerance` collapse into
 * a single station whose power is the max of its EVSEs and whose connectors are
 * their union.
 */
export function groupRowsIntoStations(
  rows: readonly IrveRow[],
  options: GroupingOptions = {},
): ChargingStation[] {
  const normalized: NormalizedRow[] = []
  for (const row of rows) {
    const value = normalizeRow(row)
    if (value) normalized.push(value)
  }
  return groupNormalizedRows(normalized, rows, options)
}

function groupNormalizedRows(
  normalized: readonly NormalizedRow[],
  rawRows: readonly IrveRow[],
  options: GroupingOptions,
): ChargingStation[] {
  const buckets = new Map<string, { rows: NormalizedRow[]; raw: IrveRow[] }>()

  normalized.forEach((row, index) => {
    let bucket = buckets.get(row.stationKey)
    if (!bucket) {
      bucket = { rows: [], raw: [] }
      buckets.set(row.stationKey, bucket)
    }
    bucket.rows.push(row)
    const raw = rawRows[index]
    if (raw) bucket.raw.push(raw)
  })

  const source: DataSource = {
    id: 'irve',
    label: IRVE_SOURCE_LABEL,
    url: IRVE_TRANSPORT_PAGE_URL,
    ...options.source,
  }

  const stations: ChargingStation[] = []

  for (const [key, bucket] of buckets) {
    const station = buildStation(key, bucket.rows, bucket.raw, source)
    if (station) stations.push(station)
  }

  return stations
}

function buildStation(
  key: string,
  rows: readonly NormalizedRow[],
  rawRows: readonly IrveRow[],
  source: DataSource,
): ChargingStation | null {
  const first = rows[0]
  if (!first) return null

  // Deduplicate EVSEs: the consolidated base occasionally repeats a point de
  // charge across contributing datasets.
  const evseById = new Map<string, EVSE>()
  for (const row of rows) {
    const existing = evseById.get(row.evse.id)
    if (!existing) {
      evseById.set(row.evse.id, row.evse)
      continue
    }
    existing.powerKw = Math.max(existing.powerKw, row.evse.powerKw)
    existing.connectors = sortConnectors([...existing.connectors, ...row.evse.connectors])
  }
  const evses = [...evseById.values()]

  // Median position: robust against a single row with a stray coordinate.
  const latitudes = rows.map((row) => row.latitude).sort((a, b) => a - b)
  const longitudes = rows.map((row) => row.longitude).sort((a, b) => a - b)
  const mid = Math.floor(latitudes.length / 2)
  const latitude = latitudes[mid] as number
  const longitude = longitudes[mid] as number

  const maxPowerKw = evses.reduce((max, evse) => Math.max(max, evse.powerKw), 0)
  const connectors = sortConnectors(evses.flatMap((evse) => evse.connectors))

  // The most informative tariff of the group wins, best confidence first; the
  // raw text is preserved whatever happens.
  const prices = rawRows.map(priceFromRow)
  const withValue = (confidence: ChargingPrice['confidence']) =>
    prices.find(
      (candidate) =>
        candidate.confidence === confidence && candidate.energyPricePerKwh !== undefined,
    )
  const price =
    withValue('exact') ??
    withValue('parsed') ??
    withValue('estimated') ??
    prices.find((candidate) => candidate.raw !== undefined) ??
    prices[0] ?? { currency: 'EUR' as const, confidence: 'unknown' as const }

  const payment = {
    payAsYouGo: consensusBoolean(rows.map((row) => row.payment.payAsYouGo)),
    creditCard: consensusBoolean(rows.map((row) => row.payment.creditCard)),
    other: consensusBoolean(rows.map((row) => row.payment.other)),
    free: consensusBoolean(rows.map((row) => row.payment.free)),
  }

  const updatedAt = latestDate(rows.map((row) => row.updatedAt))
  const address = firstDefined(rows.map((row) => row.address))
  const coordinatesTrusted = rows.some((row) => row.coordinatesConsolidated)

  const quality = qualityFor({
    price,
    hasAddress: address !== undefined,
    coordinatesTrusted,
    hasPower: maxPowerKw > 0,
    hasConnectors: connectors.length > 0,
  })

  // `nbre_pdc` is the declared count; when it disagrees with what we actually
  // grouped, we surface the discrepancy rather than picking a winner silently.
  const declared = firstDefined(rows.map((row) => row.declaredPdcCount))
  if (declared !== undefined && declared > 0 && Math.abs(declared - evses.length) > 1) {
    quality.warnings.push(
      `Les données déclarent ${declared} points de charge, ${evses.length} sont décrits.`,
    )
  }

  return {
    id: key,
    name: first.stationName,
    operatorName: firstDefined(rows.map((row) => row.operatorName ?? row.amenagerName)),
    networkName: firstDefined(rows.map((row) => row.networkName)),

    location: {
      latitude,
      longitude,
      address,
      city: firstDefined(rows.map((row) => row.city)),
      postalCode: firstDefined(rows.map((row) => row.postalCode)),
    },

    evses,
    maxPowerKw,
    connectors,
    payment,

    access: {
      condition: firstDefined(rows.map((row) => row.accessCondition)),
      openingHours: firstDefined(rows.map((row) => row.openingHours)),
      reservation: firstDefined(rows.map((row) => row.reservation)),
      pmr: rows.map((row) => row.pmr).find((value) => value !== null) ?? null,
    },

    pricing: price,
    source,
    updatedAt,
    dataQuality: quality,
  }
}

/** Declared number of charge points, falling back to the EVSEs we know about. */
export function chargePointCount(station: ChargingStation): number {
  return station.evses.length
}
