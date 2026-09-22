import { describe, expect, it, vi } from 'vitest'
import { createRetryingFetch } from '@/lib/retry-fetch'

const noDelay = () => Promise.resolve()

function response(status: number): Response {
  return new Response(null, { status })
}

describe('createRetryingFetch', () => {
  it('retries a GET after Safari reports Load failed', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError('Load failed'))
      .mockResolvedValueOnce(response(200))
    const retryingFetch = createRetryingFetch(fetchImpl, { sleep: noDelay })

    const result = await retryingFetch('https://example.test/codes')

    expect(result.status).toBe(200)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('throws the final network error after three attempts', async () => {
    const finalError = new TypeError('Load failed')
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError('Load failed'))
      .mockRejectedValueOnce(new TypeError('Load failed'))
      .mockRejectedValueOnce(finalError)
    const retryingFetch = createRetryingFetch(fetchImpl, { sleep: noDelay })

    await expect(retryingFetch('https://example.test/codes')).rejects.toBe(finalError)
    expect(fetchImpl).toHaveBeenCalledTimes(3)
  })

  it('retries a GET after a 503 response', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response(503))
      .mockResolvedValueOnce(response(200))
    const retryingFetch = createRetryingFetch(fetchImpl, { sleep: noDelay })

    const result = await retryingFetch('https://example.test/codes')

    expect(result.status).toBe(200)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it.each([400, 401, 403])('does not retry a GET after HTTP %s', async (status) => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response(status))
    const retryingFetch = createRetryingFetch(fetchImpl, { sleep: noDelay })

    const result = await retryingFetch('https://example.test/codes')

    expect(result.status).toBe(status)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('does not retry an unsafe %s request', async (method) => {
    const error = new TypeError('Load failed')
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(error)
    const retryingFetch = createRetryingFetch(fetchImpl, { sleep: noDelay })

    await expect(retryingFetch('https://example.test/codes', { method })).rejects.toBe(error)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
})
