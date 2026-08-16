import { TTL } from '@/config/constants'
import { getJson } from '@/lib/network/http'
import { isFresh, withDb, type DatasetMetadata } from '@/lib/storage/db'
import { dataGouvDatasetSchema, type DataGouvResource } from './schema'
import { IRVE_DATASET_SLUG } from './types'

const DATASET_API_URL = `https://www.data.gouv.fr/api/1/datasets/${IRVE_DATASET_SLUG}/`

const METADATA_KEY = 'irve-dataset'

export interface ResolvedIrveResource {
  /** data.gouv resource id — also the tabular API table id. */
  resourceId: string
  /** Direct file URL (CSV) of the consolidated resource. */
  fileUrl: string
  format: string
  sourceUpdatedAt?: string
  schemaVersion?: string
  fileSize?: number
  fetchedAt: number
  /** True when this came from IndexedDB rather than the network. */
  fromCache: boolean
}

/**
 * Last-resort resource id.
 *
 * The whole point of `resolveIrveResource` is to avoid a hardcoded dated URL
 * (spec 6.4); this constant only exists so a data.gouv outage does not take the
 * app down completely. It is never preferred over a live lookup or a cache hit.
 */
const FALLBACK_RESOURCE_ID = 'eb76d20a-8501-400e-b336-d85724de5435'

function scoreResource(resource: DataGouvResource): number {
  const format = (resource.format ?? '').toLowerCase()
  const title = (resource.title ?? '').toLowerCase()

  let score = 0
  if (format === 'csv') score += 100
  else if (format === 'csv.gz') score += 80
  else if (format === 'geojson') score += 40
  else return -1

  // The consolidated export of the latest schema version is what we want.
  if (title.includes('consolidation')) score += 40
  if (title.includes('derniere version') || title.includes('dernière version')) score += 30
  if (title.includes('documentation')) score -= 200

  return score
}

function versionFromTitle(title: string | null | undefined): string | undefined {
  if (!title) return undefined
  const match = /v[-\s]?(\d+\.\d+\.\d+)/i.exec(title)
  return match?.[1]
}

async function readCachedMetadata(): Promise<DatasetMetadata | null> {
  const record = await withDb((db) => db.metadata.get(METADATA_KEY))
  return record ?? null
}

async function writeCachedMetadata(metadata: DatasetMetadata): Promise<void> {
  await withDb((db) => db.metadata.put(metadata))
}

/**
 * Resolves the IRVE resource to query (spec 6.4).
 *
 * 1. reuse the cached resolution while it is within its TTL;
 * 2. otherwise fetch the dataset metadata and pick the best resource;
 * 3. on failure, fall back to a stale cache entry, then to the pinned id.
 */
export async function resolveIrveResource(
  options: { force?: boolean; signal?: AbortSignal } = {},
): Promise<ResolvedIrveResource> {
  const cached = await readCachedMetadata()

  if (!options.force && cached && isFresh(cached.fetchedAt, TTL.datasetMetadata) && cached.resourceId) {
    return {
      resourceId: cached.resourceId,
      fileUrl: cached.sourceUrl,
      format: 'csv',
      sourceUpdatedAt: cached.sourceUpdatedAt,
      schemaVersion: cached.schemaVersion,
      fetchedAt: cached.fetchedAt,
      fromCache: true,
    }
  }

  try {
    const dataset = await getJson(DATASET_API_URL, dataGouvDatasetSchema, {
      timeoutMs: 10_000,
      retries: 1,
      signal: options.signal,
    })

    const best = dataset.resources
      .map((resource) => ({ resource, score: scoreResource(resource) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)[0]

    if (!best) throw new Error('Aucune ressource IRVE exploitable dans le dataset.')

    const resolved: ResolvedIrveResource = {
      resourceId: best.resource.id,
      fileUrl: best.resource.url,
      format: (best.resource.format ?? 'csv').toLowerCase(),
      sourceUpdatedAt: best.resource.last_modified ?? dataset.last_update ?? undefined,
      schemaVersion:
        best.resource.schema?.version ?? versionFromTitle(best.resource.title) ?? undefined,
      fileSize: best.resource.filesize ?? undefined,
      fetchedAt: Date.now(),
      fromCache: false,
    }

    await writeCachedMetadata({
      id: METADATA_KEY,
      sourceUrl: resolved.fileUrl,
      resourceId: resolved.resourceId,
      fetchedAt: resolved.fetchedAt,
      sourceUpdatedAt: resolved.sourceUpdatedAt,
      schemaVersion: resolved.schemaVersion,
    })

    return resolved
  } catch (error) {
    if (cached?.resourceId) {
      console.warn('[kiwiture:irve] Métadonnées indisponibles, réutilisation du cache.', error)
      return {
        resourceId: cached.resourceId,
        fileUrl: cached.sourceUrl,
        format: 'csv',
        sourceUpdatedAt: cached.sourceUpdatedAt,
        schemaVersion: cached.schemaVersion,
        fetchedAt: cached.fetchedAt,
        fromCache: true,
      }
    }
    console.warn('[kiwiture:irve] Métadonnées indisponibles, ressource de secours utilisée.', error)
    return {
      resourceId: FALLBACK_RESOURCE_ID,
      fileUrl: '',
      format: 'csv',
      fetchedAt: 0,
      fromCache: false,
    }
  }
}

export { METADATA_KEY as IRVE_METADATA_KEY, DATASET_API_URL as IRVE_DATASET_API_URL }
