import type { Coin } from "@/lib/coins-data"

/**
 * Subset of symbols treated as executable on a connected exchange when the catalog lists them.
 * Mirrors a typical major-pairs listing from a provider; extend as your real API dictates.
 */
export const LIVE_EXCHANGE_MAJOR_SYMBOLS = new Set(
  [
    "BTC",
    "ETH",
    "BNB",
    "SOL",
    "XRP",
    "ADA",
    "DOGE",
    "AVAX",
    "DOT",
    "MATIC",
    "LINK",
    "ATOM",
    "LTC",
    "NEAR",
    "APT",
    "ARB",
    "OP",
    "UNI",
    "ETC",
    "FIL",
    "TRX",
    "SHIB",
    "WBTC",
    "USDT",
    "USDC",
  ].map((s) => s.toUpperCase())
)

/**
 * Legacy heuristic when exchange tradable lists are unavailable.
 * Prefer `/api/exchange/tradable-symbols` + `getLiveRouteLabel` for real routing.
 */
export function isSymbolLiveOnExchange(symbol: string): boolean {
  return LIVE_EXCHANGE_MAJOR_SYMBOLS.has(symbol.trim().toUpperCase())
}

/** Status from `useExchangeTradableBases` / tradable-symbols API */
export type TradableBasesFetchStatus =
  | "idle"
  | "loading"
  | "ok"
  | "error"
  | "blocked"
  | "unsupported"

export type LiveRouteState = "desk" | "checking" | "live" | "not_listed" | "unknown" | "unsupported"

export function getLiveRouteState(
  exchangeConnected: boolean,
  symbol: string,
  bases: Set<string> | null,
  status: TradableBasesFetchStatus
): LiveRouteState {
  if (!exchangeConnected) return "desk"
  if (status === "unsupported") return "unsupported"
  if (status === "blocked" || status === "error" || status === "idle") return "unknown"
  if (status === "loading" || bases === null) return "checking"
  const s = symbol.trim().toUpperCase()
  if (bases.has(s)) return "live"
  return "not_listed"
}

export function getLiveRouteLabel(state: LiveRouteState): { text: string; tone: "success" | "warning" | "muted" | "default" } {
  switch (state) {
    case "desk":
      return { text: "Desk analysis", tone: "muted" }
    case "checking":
      return { text: "Checking exchange…", tone: "default" }
    case "live":
      return { text: "Live pair on exchange", tone: "success" }
    case "not_listed":
      return { text: "Not on this exchange", tone: "warning" }
    case "unsupported":
      return { text: "Venue list not wired yet", tone: "muted" }
    default:
      return { text: "Exchange list unavailable", tone: "muted" }
  }
}

/** Compact tag for dense lists (full text via getLiveRouteLabel + title tooltip). */
export function getLiveRouteShortLabel(state: LiveRouteState): string {
  switch (state) {
    case "live":
      return "Live"
    case "desk":
      return "Desk"
    case "checking":
      return "…"
    case "not_listed":
      return "No pair"
    case "unsupported":
      return "N/A"
    default:
      return "—"
  }
}

export function suggestSimilarCoins(coins: readonly Coin[], rawQuery: string, limit = 8): Coin[] {
  const q = rawQuery.trim().toLowerCase()
  if (!q) return []
  const ranked = coins
    .map((c) => {
      const s = c.symbol.toLowerCase()
      const n = c.name.toLowerCase()
      let score = 0
      if (s === q) score = 100
      else if (s.startsWith(q)) score = 85
      else if (n.startsWith(q)) score = 75
      else if (s.includes(q)) score = 55
      else if (n.includes(q)) score = 45
      else {
        let j = 0
        let sub = 0
        for (const ch of q) {
          const k = s.indexOf(ch, j)
          if (k === -1) {
            sub = 0
            break
          }
          sub++
          j = k + 1
        }
        if (sub === q.length) score = 30
      }
      return { c, score }
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.c.symbol.localeCompare(b.c.symbol))
  return ranked.slice(0, limit).map((x) => x.c)
}
