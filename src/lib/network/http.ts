import type { ZodType } from 'zod'
import { NetworkError, RETRYABLE_STATUS } from './errors'

export interface HttpOptions {
  /** Abort the request after this many milliseconds. */
  timeoutMs?: number
  /** Max additional attempts after the first one. */
  retries?: number
  /** Base backoff in ms, doubled on each attempt and capped. */
  backoffMs?: number
  signal?: AbortSignal
  headers?: Record<string, string>
}

const DEFAULTS = {
  timeoutMs: 12_000,
  retries: 2,
  backoffMs: 400,
  maxBackoffMs: 4_000,
} as const

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

function isOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}

/**
 * Reads the `Retry-After` header when the server sends one (429 handling, spec 39).
 * Returns milliseconds, or null when absent/unparseable.
 */
function retryAfterMs(response: Response): number | null {
  const header = response.headers.get('retry-after')
  if (!header) return null
  const seconds = Number(header)
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, 10_000)
  const date = Date.parse(header)
  if (!Number.isNaN(date)) return Math.max(0, Math.min(date - Date.now(), 10_000))
  return null
}

/** Single fetch attempt with its own timeout, linked to the caller's signal. */
async function fetchOnce(url: string, options: HttpOptions): Promise<Response> {
  const timeoutMs = options.timeoutMs ?? DEFAULTS.timeoutMs
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(new DOMException('Timeout', 'TimeoutError')), timeoutMs)

  const onExternalAbort = () => controller.abort(options.signal?.reason)
  options.signal?.addEventListener('abort', onExternalAbort, { once: true })

  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: { accept: 'application/json', ...options.headers },
      credentials: 'omit',
      mode: 'cors',
    })
  } catch (error) {
    if (options.signal?.aborted) {
      throw new NetworkError('aborted', 'Requete annulee.', { url, cause: error })
    }
    if (controller.signal.aborted) {
      throw new NetworkError('timeout', 'Delai depasse.', { url, cause: error })
    }
    if (isOffline()) {
      throw new NetworkError('offline', 'Vous etes hors ligne.', { url, cause: error })
    }
    throw new NetworkError('unknown', 'Le service est injoignable.', { url, cause: error })
  } finally {
    clearTimeout(timer)
    options.signal?.removeEventListener('abort', onExternalAbort)
  }
}

async function request(url: string, options: HttpOptions = {}): Promise<Response> {
  if (isOffline()) {
    throw new NetworkError('offline', 'Vous etes hors ligne.', { url })
  }

  const retries = options.retries ?? DEFAULTS.retries
  const baseBackoff = options.backoffMs ?? DEFAULTS.backoffMs
  let lastError: NetworkError | undefined

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    let response: Response
    try {
      response = await fetchOnce(url, options)
    } catch (error) {
      const networkError =
        error instanceof NetworkError
          ? error
          : new NetworkError('unknown', 'Erreur reseau.', { url, cause: error })
      // `aborted` and `offline` are terminal: retrying changes nothing.
      if (!networkError.retryable || attempt === retries) throw networkError
      lastError = networkError
      await sleep(Math.min(baseBackoff * 2 ** attempt, DEFAULTS.maxBackoffMs))
      continue
    }

    if (response.ok) return response

    const httpError = new NetworkError('http', `Erreur HTTP ${response.status}.`, {
      status: response.status,
      url,
    })

    if (!RETRYABLE_STATUS.has(response.status) || attempt === retries) throw httpError

    lastError = httpError
    const wait = retryAfterMs(response) ?? Math.min(baseBackoff * 2 ** attempt, DEFAULTS.maxBackoffMs)
    await sleep(wait)
  }

  throw lastError ?? new NetworkError('unknown', 'Erreur reseau.', { url })
}

/** GET returning validated JSON. `schema` is mandatory for external data (spec 33.3). */
export async function getJson<T>(
  url: string,
  schema: ZodType<T>,
  options: HttpOptions = {},
): Promise<T> {
  const response = await request(url, options)

  let payload: unknown
  try {
    payload = await response.json()
  } catch (error) {
    throw new NetworkError('parse', 'Reponse illisible.', { url, cause: error })
  }

  const parsed = schema.safeParse(payload)
  if (!parsed.success) {
    throw new NetworkError('validation', 'Reponse inattendue du service.', {
      url,
      cause: parsed.error,
    })
  }
  return parsed.data
}

/** GET returning raw text (CSV downloads). */
export async function getText(url: string, options: HttpOptions = {}): Promise<string> {
  const response = await request(url, { headers: { accept: 'text/plain,*/*' }, ...options })
  try {
    return await response.text()
  } catch (error) {
    throw new NetworkError('parse', 'Reponse illisible.', { url, cause: error })
  }
}

/** Runs `tasks` with a bounded number of concurrent promises (spec 16). */
export async function mapWithConcurrency<TIn, TOut>(
  items: readonly TIn[],
  limit: number,
  worker: (item: TIn, index: number) => Promise<TOut>,
): Promise<TOut[]> {
  const results = new Array<TOut>(items.length)
  let cursor = 0

  const runners = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    for (;;) {
      const index = cursor
      cursor += 1
      if (index >= items.length) return
      results[index] = await worker(items[index] as TIn, index)
    }
  })

  await Promise.all(runners)
  return results
}
