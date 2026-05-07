/** Client helpers for POST /api/user/exchange-connections — retries + offline queue. */

export const EXCHANGE_CONN_MAX_RETRIES = 5
export const EXCHANGE_CONN_BASE_DELAY_MS = 600

const PENDING_KEY = "nexus_exchange_pending_sync_v1"

export type PersistExchangeResult =
  | { ok: true; metaSyncFailed?: string | null }
  | { ok: false; status?: number; error: string }

export function stashPendingExchangeConnections(connections: unknown[]): void {
  if (typeof window === "undefined") return
  try {
    sessionStorage.setItem(PENDING_KEY, JSON.stringify({ at: Date.now(), connections }))
  } catch {
    /* quota / private mode */
  }
}

export function takePendingExchangeConnections(): unknown[] | null {
  if (typeof window === "undefined") return null
  try {
    const raw = sessionStorage.getItem(PENDING_KEY)
    if (!raw) return null
    const o = JSON.parse(raw) as { connections?: unknown[] }
    return Array.isArray(o.connections) ? o.connections : null
  } catch {
    return null
  }
}

export function clearPendingExchangeConnections(): void {
  if (typeof window === "undefined") return
  try {
    sessionStorage.removeItem(PENDING_KEY)
  } catch {
    /* ignore */
  }
}

/**
 * Persists exchange payloads to profiles + Auth metadata (server). Retries on
 * transient failures; does not retry 400 / 401 / 413.
 */
export async function persistExchangeConnections(
  accessToken: string,
  connections: unknown[],
): Promise<PersistExchangeResult> {
  let lastErr = "unknown"
  for (let attempt = 0; attempt < EXCHANGE_CONN_MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const backoff =
        EXCHANGE_CONN_BASE_DELAY_MS * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 250)
      await new Promise((r) => setTimeout(r, backoff))
    }
    try {
      const res = await fetch("/api/user/exchange-connections", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ connections }),
      })
      const body = (await res.json().catch(() => ({}))) as {
        error?: string
        metaSyncFailed?: string | null
        ok?: boolean
      }
      if (res.ok) {
        return {
          ok: true as const,
          ...(body.metaSyncFailed != null && String(body.metaSyncFailed).length > 0
            ? { metaSyncFailed: String(body.metaSyncFailed) }
            : {}),
        }
      }
      lastErr = typeof body.error === "string" ? body.error : `HTTP ${res.status}`
      if (res.status === 400 || res.status === 401 || res.status === 413) {
        return { ok: false, status: res.status, error: lastErr }
      }
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e)
    }
  }
  return { ok: false, error: lastErr }
}
