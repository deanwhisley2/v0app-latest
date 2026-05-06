import { queryTradeMemory, type MarketRegime, type TradeMemoryRow } from "@/lib/trade-memory"
import { createAdminClient } from "@/lib/supabaseAdmin"

export const MAX_CONFIDENCE = 85
const MIN_HISTORY_SAMPLES = 8
const FALLBACK_HISTORICAL_FACTOR = 0.58

export type ConfidenceExplanation = {
  raw: number
  historicalFactor: number
  regimePenalty: number
  recentPenalty: number
  final: number
  sampleSize: number
}

export type CalibrateConfidenceInput = {
  userId?: string
  symbol: string
  decision: "BUY" | "SELL" | "HOLD"
  rawConfidence: number
  /** Bucket for TradeMemory / scoped history (use regimeBucketForTradeMemory from market-state-authority). */
  marketRegime?: MarketRegime
  /** Full live label for penalty (defaults to marketRegime when omitted). */
  liveMarketRegimeForPenalty?: string
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}

function round2(n: number): number {
  return Number(n.toFixed(2))
}

async function resolveScopedRows(input: CalibrateConfidenceInput): Promise<TradeMemoryRow[]> {
  let sessionIds: string[] | undefined
  if (input.userId) {
    const admin = createAdminClient()
    const { data, error } = await admin.from("TradeSession").select("id").eq("userId", input.userId).limit(5000)
    if (error) throw new Error(`DB_READ_FAILED: TradeSession scope — ${error.message}`)
    sessionIds = (data ?? []).map((r) => String(r.id)).filter((id) => id.length > 0)
    if (sessionIds.length === 0) return []
  }
  const rows = await queryTradeMemory({
    symbol: input.symbol,
    regime: input.marketRegime,
    sessionIds,
    limit: 200,
  })
  return rows.filter((r) => r.decision === input.decision)
}

export async function getHistoricalAccuracy(input: CalibrateConfidenceInput): Promise<{ factor: number; sampleSize: number }> {
  const rows = await resolveScopedRows(input)
  const recent = rows.slice(0, 30)
  const sampleSize = recent.length
  if (sampleSize < MIN_HISTORY_SAMPLES) {
    return { factor: FALLBACK_HISTORICAL_FACTOR, sampleSize }
  }
  const wins = recent.filter((r) => r.wasWin === true).length
  const winRate = wins / sampleSize
  const factor = clamp(winRate, 0.45, 0.92)
  return { factor: round2(factor), sampleSize }
}

/** Penalty multipliers for fused decision calibration — aligned with live market-state authority labels. */
export function applyRegimePenalty(marketRegime: string | undefined): number {
  const r = String(marketRegime ?? "UNKNOWN").toUpperCase()
  switch (r) {
    case "TRENDING":
      return 0.98
    case "RECOVERY_BOUNCE":
      return 0.96
    case "SIDEWAYS":
      return 0.84
    case "CHOPPING":
      return 0.78
    case "VOLATILE":
      return 0.86
    case "PANIC":
      return 0.72
    case "LOW_LIQUIDITY":
      return 0.74
    case "LIQUIDITY_STRESS":
      return 0.68
    case "CASCADE_CONDITIONS":
      return 0.7
    case "UNKNOWN":
      console.log(`[confidence-calibration] regimePenalty DEGRADED explicit UNKNOWN (no live structure)`)
      return 0.93
    default:
      console.log(`[confidence-calibration] regimePenalty unmapped regime=${r} treating as moderate stress`)
      return 0.88
  }
}

export async function applyRecentPerformancePenalty(input: CalibrateConfidenceInput): Promise<number> {
  const rows = await resolveScopedRows(input)
  const recent = rows.slice(0, 10)
  if (recent.length === 0) return 0.95
  let consecutiveLosses = 0
  for (const row of recent) {
    if (row.wasWin === false) consecutiveLosses += 1
    else break
  }
  const recentPnl = recent
    .map((r) => r.pnlUsd)
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v))
    .reduce((s, v) => s + v, 0)

  let penalty = 1
  if (consecutiveLosses >= 3) penalty *= 0.82
  else if (consecutiveLosses === 2) penalty *= 0.9
  else if (consecutiveLosses === 1) penalty *= 0.95
  if (recentPnl < 0) penalty *= 0.92
  return round2(clamp(penalty, 0.7, 1))
}

export function buildConfidenceExplanation(input: Omit<ConfidenceExplanation, "final">): ConfidenceExplanation {
  const final = Math.min(MAX_CONFIDENCE, input.raw * input.historicalFactor * input.regimePenalty * input.recentPenalty)
  return {
    ...input,
    final: Math.round(clamp(final, 0, MAX_CONFIDENCE)),
  }
}

export async function calibrateConfidence(input: CalibrateConfidenceInput): Promise<ConfidenceExplanation> {
  const raw = Math.round(clamp(input.rawConfidence, 0, 100))
  const { factor: historicalFactor, sampleSize } = await getHistoricalAccuracy(input)
  const penaltyRegime = input.liveMarketRegimeForPenalty ?? input.marketRegime
  const regimePenalty = applyRegimePenalty(penaltyRegime)
  const recentPenalty = await applyRecentPerformancePenalty(input)
  const explanation = buildConfidenceExplanation({
    raw,
    historicalFactor,
    regimePenalty,
    recentPenalty,
    sampleSize,
  })
  console.log(
    `[confidence-calibration] raw=${explanation.raw} historicalFactor=${explanation.historicalFactor} regimePenalty=${explanation.regimePenalty} recentPenalty=${explanation.recentPenalty} final=${explanation.final} liveRegime=${penaltyRegime ?? input.marketRegime ?? "UNKNOWN"} memoryBucket=${input.marketRegime ?? "UNKNOWN"}`
  )
  return explanation
}
