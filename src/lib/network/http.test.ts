import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { NetworkError } from './errors'
import { getJson, mapWithConcurrency } from './http'

const schema = z.object({ ok: z.boolean() })

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('getJson', () => {
  it('returns validated data', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ ok: true })))
    await expect(getJson('https://example.test/a', schema)).resolves.toEqual({ ok: true })
  })

  it('rejects a payload that does not match the schema', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ ok: 'yes' })))
    await expect(getJson('https://example.test/a', schema)).rejects.toMatchObject({
      kind: 'validation',
    })
  })

  it('does not retry a 404', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('', { status: 404 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(getJson('https://example.test/a', schema, { retries: 3 })).rejects.toBeInstanceOf(
      NetworkError,
    )
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it.each([400, 401, 403, 404])('does not retry a %i', async (status) => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('', { status }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(getJson('https://example.test/a', schema, { retries: 2 })).rejects.toBeTruthy()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('retries a 503 and succeeds', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      getJson('https://example.test/a', schema, { retries: 2, backoffMs: 1 }),
    ).resolves.toEqual({ ok: true })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('honours Retry-After on a 429', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 429, headers: { 'retry-after': '0' } }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      getJson('https://example.test/a', schema, { retries: 1, backoffMs: 1 }),
    ).resolves.toEqual({ ok: true })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('reports an offline error without hitting the network', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)

    await expect(getJson('https://example.test/a', schema)).rejects.toMatchObject({
      kind: 'offline',
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('mapWithConcurrency', () => {
  it('preserves the input order', async () => {
    const result = await mapWithConcurrency([1, 2, 3, 4], 2, async (value) => value * 2)
    expect(result).toEqual([2, 4, 6, 8])
  })

  it('never exceeds the concurrency limit', async () => {
    let running = 0
    let peak = 0
    await mapWithConcurrency(Array.from({ length: 10 }, (_, i) => i), 3, async () => {
      running += 1
      peak = Math.max(peak, running)
      await new Promise((resolve) => setTimeout(resolve, 1))
      running -= 1
    })
    expect(peak).toBeLessThanOrEqual(3)
  })

  it('handles an empty input', async () => {
    await expect(mapWithConcurrency([], 4, async () => 1)).resolves.toEqual([])
  })
})
