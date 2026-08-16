import {
  MAX_IRVE_ROWS_PER_SEARCH,
  TABULAR_CONCURRENCY,
  TABULAR_PAGE_SIZE,
} from '@/config/constants'
import type { BoundingBox } from '@/lib/geo/coordinates'
import { getJson, mapWithConcurrency } from '@/lib/network/http'
import { irveRowSchema, tabularResponseSchema } from './schema'
import { IRVE_COLUMNS, type IrveRow } from './types'

/**
 * Client for the data.gouv tabular API (spec 6.3).
 *
 * https://tabular-api.data.gouv.fr — beta, read-only, GET, CORS-enabled.
 * It supports column filters, which is what lets us pull a bounding box worth of
 * rows instead of the 150 MB national file.
 */

const BASE_URL = 'https://tabular-api.data.gouv.fr/api/resources'

export interface TabularQueryResult {
  rows: IrveRow[]
  /** Total rows matching the filter, as reported by the API. */
  total: number
  /** True when we deliberately stopped short of `total`. */
  truncated: boolean
}

function buildUrl(
  resourceId: string,
  box: BoundingBox,
  page: number,
  pageSize: number,
  columns: readonly string[] | null,
): string {
  const params = new URLSearchParams()
  params.set('consolidated_latitude__greater', box.minLat.toFixed(6))
  params.set('consolidated_latitude__less', box.maxLat.toFixed(6))
  params.set('consolidated_longitude__greater', box.minLon.toFixed(6))
  params.set('consolidated_longitude__less', box.maxLon.toFixed(6))
  // Deterministic ordering, otherwise pages can overlap or skip rows.
  params.set('consolidated_latitude__sort', 'asc')
  params.set('page', String(page))
  params.set('page_size', String(pageSize))
  if (columns) params.set('columns', columns.join(','))
  return `${BASE_URL}/${resourceId}/data/?${params.toString()}`
}

/** Validates rows individually so one broken record cannot void a whole page. */
function parseRows(payload: readonly unknown[]): IrveRow[] {
  const rows: IrveRow[] = []
  for (const item of payload) {
    const parsed = irveRowSchema.safeParse(item)
    if (parsed.success) rows.push(parsed.data as IrveRow)
  }
  return rows
}

/** Cheap probe returning how many rows a bounding box holds. */
export async function countRowsInBoundingBox(
  resourceId: string,
  box: BoundingBox,
  signal?: AbortSignal,
): Promise<number> {
  const url = buildUrl(resourceId, box, 1, 1, ['id_station_itinerance'])
  const response = await getJson(url, tabularResponseSchema, { timeoutMs: 10_000, retries: 1, signal })
  return response.meta?.total ?? response.data.length
}

/**
 * Fetches every IRVE row inside a bounding box, capped at
 * `MAX_IRVE_ROWS_PER_SEARCH` so a dense city centre cannot trigger 40 requests.
 */
export async function fetchRowsInBoundingBox(
  resourceId: string,
  box: BoundingBox,
  options: { signal?: AbortSignal; maxRows?: number } = {},
): Promise<TabularQueryResult> {
  const maxRows = options.maxRows ?? MAX_IRVE_ROWS_PER_SEARCH

  const firstUrl = buildUrl(resourceId, box, 1, TABULAR_PAGE_SIZE, IRVE_COLUMNS)
  const first = await getJson(firstUrl, tabularResponseSchema, {
    timeoutMs: 15_000,
    retries: 2,
    signal: options.signal,
  })

  const total = first.meta?.total ?? first.data.length
  const rows = parseRows(first.data)

  const wanted = Math.min(total, maxRows)
  const remainingPages = Math.max(0, Math.ceil(wanted / TABULAR_PAGE_SIZE) - 1)

  if (remainingPages > 0) {
    const pages = Array.from({ length: remainingPages }, (_, index) => index + 2)
    const pageResults = await mapWithConcurrency(pages, TABULAR_CONCURRENCY, async (page) => {
      const url = buildUrl(resourceId, box, page, TABULAR_PAGE_SIZE, IRVE_COLUMNS)
      const response = await getJson(url, tabularResponseSchema, {
        timeoutMs: 15_000,
        retries: 1,
        signal: options.signal,
      })
      return parseRows(response.data)
    })
    for (const pageRows of pageResults) rows.push(...pageRows)
  }

  return { rows, total, truncated: total > wanted }
}
