import { buildFocusUniverse } from "@/lib/behavior-market-intelligence"

/** Normalize to USDT spot pair key (e.g. BTC -> BTCUSDT). */
export function toUsdtPairKey(symbolRaw: string): string {
  const s = symbolRaw.trim().toUpperCase().replace(/[^A-Z0-9]/g, "")
  if (!s) return ""
  return s.endsWith("USDT") ? s : `${s}USDT`
}

/**
 * Symbols allowed to consume Grok API quota (default: focus universe + optional auto-trader list).
 *
 * NEXUS_GROK_QUOTA_SCOPE:
 *   - `focus` (default): only Focus universe (NEXUS_FOCUS_SYMBOLS + defaults + gold if enabled)
 *   - `focus_plus_trader`: focus ∪ bases from AUTO_TRADER_SYMBOLS (same env as auto-trader daemon)
 *   - `all`: any symbol when client requests Grok (high spend — dev / emergency only)
 */
export function getGrokQuotaScope(): "focus" | "focus_plus_trader" | "all" {
  const v = process.env.NEXUS_GROK_QUOTA_SCOPE?.trim().toLowerCase()
  if (v === "all" || v === "focus_plus_trader") return v
  return "focus"
}

function autoTraderPairs(): Set<string> {
  const raw = process.env.AUTO_TRADER_SYMBOLS || "BTC,ETH"
  const set = new Set<string>()
  for (const part of raw.split(",")) {
    const base = part.trim().toUpperCase().replace(/USDT$/i, "").replace(/[^A-Z0-9]/g, "")
    if (base) set.add(`${base}USDT`)
  }
  return set
}

export function isSymbolEligibleForGrokQuota(symbolRaw: string): boolean {
  const pair = toUsdtPairKey(symbolRaw)
  if (!pair) return false

  const scope = getGrokQuotaScope()
  if (scope === "all") return true

  const configuredFocus = buildFocusUniverse(
    process.env.NEXUS_FOCUS_SYMBOLS?.split(",").map((s) => s.trim()).filter(Boolean),
    process.env.NEXUS_FOCUS_INCLUDE_GOLD === "1"
  )
  const focusSet = new Set(configuredFocus.map((x) => x.toUpperCase()))
  if (focusSet.has(pair)) return true

  if (scope === "focus_plus_trader") {
    return autoTraderPairs().has(pair)
  }

  return false
}
