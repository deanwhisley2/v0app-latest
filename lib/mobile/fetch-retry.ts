export type FetchRetryOptions = {
  retries?: number
  baseDelayMs?: number
  retryOn?: (res: Response) => boolean
  signal?: AbortSignal
}

const DEFAULT_RETRY_ON = (res: Response) => res.status >= 500 || res.status === 429

/** Retry-safe fetch for flaky mobile networks — exponential backoff, no mutation retries. */
export async function fetchWithRetry(
  input: RequestInfo | URL,
  init?: RequestInit,
  opts?: FetchRetryOptions,
): Promise<Response> {
  const retries = opts?.retries ?? 2
  const baseDelayMs = opts?.baseDelayMs ?? 400
  const retryOn = opts?.retryOn ?? DEFAULT_RETRY_ON
  let lastError: unknown

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(input, {
        ...init,
        signal: opts?.signal ?? init?.signal,
      })
      if (attempt < retries && retryOn(res)) {
        await res.body?.cancel().catch(() => undefined)
        await sleep(baseDelayMs * 2 ** attempt)
        continue
      }
      return res
    } catch (e) {
      lastError = e
      if (attempt >= retries) break
      if (opts?.signal?.aborted) throw e
      await sleep(baseDelayMs * 2 ** attempt)
    }
  }

  throw lastError instanceof Error ? lastError : new Error("fetch_failed")
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
