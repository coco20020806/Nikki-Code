const RETRYABLE_STATUS_CODES = new Set([502, 503, 504])
const SAFE_RETRY_METHODS = new Set(['GET', 'HEAD'])

type RetryFetchOptions = {
  delaysMs?: readonly number[]
  sleep?: (delayMs: number) => Promise<void>
}

function getRequestMethod(input: RequestInfo | URL, init?: RequestInit): string {
  if (init?.method) return init.method.toUpperCase()
  if (typeof Request !== 'undefined' && input instanceof Request) return input.method.toUpperCase()
  return 'GET'
}

function defaultSleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs))
}

export function isRetryableNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) return false

  if (error.name === 'NetworkError') return true

  return /load failed|failed to fetch|networkerror|network request failed/i.test(error.message)
}

export function createRetryingFetch(
  fetchImpl: typeof fetch,
  options: RetryFetchOptions = {},
): typeof fetch {
  const delaysMs = options.delaysMs ?? [300, 1000]
  const sleep = options.sleep ?? defaultSleep

  return (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const method = getRequestMethod(input, init)
    if (!SAFE_RETRY_METHODS.has(method)) return fetchImpl(input, init)

    for (let attempt = 0; ; attempt += 1) {
      try {
        const response = await fetchImpl(input, init)
        const shouldRetry = RETRYABLE_STATUS_CODES.has(response.status) && attempt < delaysMs.length
        if (!shouldRetry) return response
      } catch (error) {
        const shouldRetry = isRetryableNetworkError(error) && attempt < delaysMs.length
        if (!shouldRetry) throw error
      }

      await sleep(delaysMs[attempt])
    }
  }) as typeof fetch
}
