const WATCH_KEY = "nexus_watchlist_v1"
const FAV_KEY = "nexus_favorites_v1"

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function writeJson(key: string, value: unknown) {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* ignore */
  }
}

export function getWatchlistSymbols(): string[] {
  const v = readJson<string[]>(WATCH_KEY, ["BTC", "ETH", "SOL", "AVAX"])
  return Array.isArray(v) ? [...new Set(v.map((s) => String(s).toUpperCase()))] : ["BTC", "ETH", "SOL"]
}

export function setWatchlistSymbols(symbols: string[]) {
  writeJson(WATCH_KEY, symbols)
}

export function getFavoriteSymbols(): string[] {
  const v = readJson<string[]>(FAV_KEY, ["BTC", "LINK", "DOGE"])
  return Array.isArray(v) ? [...new Set(v.map((s) => String(s).toUpperCase()))] : ["BTC", "LINK"]
}

export function setFavoriteSymbols(symbols: string[]) {
  writeJson(FAV_KEY, symbols)
}
