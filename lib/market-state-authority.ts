/**
 * Single operational source for live market regime / systemic classification.
 * Analysis, calibration, governance approvals, and telemetry should use this
 * (via resolveAuthoritativeMarketState) — not ad-hoc UNKNOWN or duplicate fetches.
 */
import { refreshLiveMarketStructure } from "@/lib/market-regime-engine"
import type { MarketRegime as TradeMemoryRegime } from "@/lib/trade-memory"

export const DEFAULT_AUTHORITY_SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT"] as const

/** Default TTL aligned with governance approval path (Binance + DB upsert). */
export const DEFAULT_AUTHORITY_MIN_REFRESH_MS = 45_000

export type AuthoritativeMarketState = {
  marketRegime: string
  systemicRiskState: string
  volatilityScore: number
  liquidityStressScore: number
  correlationScore: number
  regimeConfidence: number
  degraded: boolean
  degradeReason?: string
}

/**
 * Collapse live engine labels into TradeMemory / historical-query buckets (5-way union).
 */
export function regimeBucketForTradeMemory(live: string): TradeMemoryRegime {
  const u = String(live || "UNKNOWN").toUpperCase()
  if (u === "TRENDING" || u === "CHOPPING" || u === "VOLATILE" || u === "SIDEWAYS" || u === "UNKNOWN") return u
  if (
    u === "PANIC" ||
    u === "LIQUIDITY_STRESS" ||
    u === "LOW_LIQUIDITY" ||
    u === "CASCADE_CONDITIONS"
  ) {
    return "VOLATILE"
  }
  if (u === "RECOVERY_BOUNCE") return "TRENDING"
  return "CHOPPING"
}

export async function resolveAuthoritativeMarketState(input: {
  consumer: string
  scope?: string
  symbols?: string[]
  minRefreshMs?: number
}): Promise<AuthoritativeMarketState> {
  try {
    const row = await refreshLiveMarketStructure({
      scope: input.scope ?? "GLOBAL",
      symbols: input.symbols ?? [...DEFAULT_AUTHORITY_SYMBOLS],
      minRefreshMs: input.minRefreshMs ?? DEFAULT_AUTHORITY_MIN_REFRESH_MS,
    })
    const regimeConfidence = Number((row as { regimeConfidence?: number }).regimeConfidence ?? 0)
    console.log(
      `[runtime-market-state] consumer=${input.consumer} regime=${row.marketRegime} systemic=${row.systemicRiskState} degraded=false vol=${Number(row.volatilityScore).toFixed(3)} liq=${Number(row.liquidityStressScore).toFixed(3)} corr=${Number(row.correlationScore).toFixed(3)}`,
    )
    return {
      marketRegime: String(row.marketRegime),
      systemicRiskState: String(row.systemicRiskState),
      volatilityScore: Number(row.volatilityScore),
      liquidityStressScore: Number(row.liquidityStressScore),
      correlationScore: Number(row.correlationScore),
      regimeConfidence,
      degraded: false,
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.warn(`[runtime-market-state] consumer=${input.consumer} DEGRADED fallback=UNKNOWN reason=${msg}`)
    return {
      marketRegime: "UNKNOWN",
      systemicRiskState: "NORMAL",
      volatilityScore: 0,
      liquidityStressScore: 0,
      correlationScore: 0,
      regimeConfidence: 0,
      degraded: true,
      degradeReason: msg,
    }
  }
}
