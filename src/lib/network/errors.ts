export type NetworkErrorKind =
  | 'offline'
  | 'timeout'
  | 'aborted'
  | 'http'
  | 'parse'
  | 'validation'
  | 'unknown'

/** Typed transport error so the UI can pick the right message (spec 39 / 45). */
export class NetworkError extends Error {
  readonly kind: NetworkErrorKind
  readonly status?: number
  readonly url?: string
  override readonly cause?: unknown

  constructor(
    kind: NetworkErrorKind,
    message: string,
    options: { status?: number; url?: string; cause?: unknown } = {},
  ) {
    super(message)
    this.name = 'NetworkError'
    this.kind = kind
    this.status = options.status
    this.url = options.url
    this.cause = options.cause
  }

  /** True when the failure is transient enough to justify a retry (spec 39). */
  get retryable(): boolean {
    if (this.kind === 'timeout') return true
    if (this.kind === 'http' && this.status !== undefined) return RETRYABLE_STATUS.has(this.status)
    return false
  }
}

export const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504])

/** Never retried: the answer will not change (spec 39). */
export const NON_RETRYABLE_STATUS = new Set([400, 401, 403, 404])

export function isNetworkError(error: unknown): error is NetworkError {
  return error instanceof NetworkError
}
