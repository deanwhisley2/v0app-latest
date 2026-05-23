/** Deduped OHLCV close series for card sparklines (authority-backed `/api/market/ohlcv`). */

type SparklineEntry = {
  closes: number[]
  fetchedAt: number
  inflight?: Promise<number[]>
}

const cache = new Map<string, SparklineEntry>()
const REFRESH_MS = 60_000

export function resolveDeskChartSymbol(strategies: string[], speciality: string): string {
  const blob = `${strategies.join(" ")} ${speciality}`.toUpperCase()
  if (/\bSOL\b/.test(blob)) return "SOL"
  if (/\bETH\b/.test(blob)) return "ETH"
  if (/\bBTC\b/.test(blob)) return "BTC"
  return "BTC"
}

export async function fetchSparklineCloses(symbol: string, days = 1): Promise<number[]> {
  const sym = symbol.toUpperCase()
  const now = Date.now()
  const hit = cache.get(sym)
  if (hit && hit.closes.length >= 4 && now - hit.fetchedAt < REFRESH_MS) {
    return hit.closes
  }
  if (hit?.inflight) return hit.inflight

  const inflight = (async () => {
    const res = await fetch(
      `/api/market/ohlcv?symbol=${encodeURIComponent(sym)}&days=${days}`,
      { cache: "no-store" },
    )
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean
      bars?: Array<{ close: number }>
    }
    if (!res.ok || !data.ok || !data.bars?.length) {
      throw new Error("ohlcv_unavailable")
    }
    const closes = data.bars.map((b) => b.close).filter((c) => Number.isFinite(c) && c > 0)
    cache.set(sym, { closes, fetchedAt: Date.now() })
    return closes
  })()

  cache.set(sym, { closes: hit?.closes ?? [], fetchedAt: hit?.fetchedAt ?? 0, inflight })
  try {
    return await inflight
  } finally {
    const cur = cache.get(sym)
    if (cur) delete cur.inflight
  }
}
