import { createAdminClient } from "@/lib/supabaseAdmin"
import { queryTradeMemory, type MarketRegime, type QueryTradeMemoryParams, type TradeMemoryRow } from "@/lib/trade-memory"

export type TradeAnalyticsFilters = {
  userId?: string
  symbol?: string
  regime?: MarketRegime
  from?: string
  to?: string
  minConfidence?: number
  maxConfidence?: number
  minCalibratedConfidence?: number
  maxCalibratedConfidence?: number
  wasWin?: boolean
  limit?: number
}

type WinRateStat = { trades: number; wins: number; winRate: number }

export type TradeAnalyticsSummary = {
  filters: TradeAnalyticsFilters
  trades: number
  winRate: ReturnType<typeof calculateWinRate>
  pnl: ReturnType<typeof calculatePnLStats>
  confidence: ReturnType<typeof calculateConfidenceStats>
  signalPerformance: ReturnType<typeof calculateSignalPerformance>
  regimePerformance: ReturnType<typeof calculateRegimePerformance>
}

function requireAdmin() {
  try {
    return createAdminClient()
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error("[trade-analytics] DB_READ_FAILED: admin client unavailable:", msg)
    throw new Error(`DB_READ_FAILED: ${msg}`)
  }
}

function toPct(wins: number, total: number): number {
  if (total <= 0) return 0
  return Number(((wins / total) * 100).toFixed(2))
}

function toFixedNum(value: number, digits = 4): number {
  return Number(value.toFixed(digits))
}

function confidenceBucket(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "UNKNOWN"
  if (value < 40) return "0-40"
  if (value < 60) return "40-60"
  if (value < 75) return "60-75"
  if (value < 85) return "75-85"
  return "85+"
}

function confidenceBucketCalibrated(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "UNKNOWN"
  if (value < 40) return "0-40"
  if (value < 60) return "40-60"
  if (value < 75) return "60-75"
  if (value <= 85) return "75-85"
  return "85+ (legacy)"
}

function avg(numbers: number[]): number {
  if (numbers.length === 0) return 0
  return numbers.reduce((s, n) => s + n, 0) / numbers.length
}

function correlation(xs: number[], ys: number[]): number | null {
  if (xs.length !== ys.length || xs.length < 2) return null
  const meanX = avg(xs)
  const meanY = avg(ys)
  let num = 0
  let denX = 0
  let denY = 0
  for (let i = 0; i < xs.length; i++) {
    const dx = xs[i] - meanX
    const dy = ys[i] - meanY
    num += dx * dy
    denX += dx * dx
    denY += dy * dy
  }
  const den = Math.sqrt(denX * denY)
  if (!Number.isFinite(den) || den === 0) return null
  return toFixedNum(num / den, 4)
}

function winRateFor(rows: TradeMemoryRow[]): WinRateStat {
  const wins = rows.filter((r) => r.wasWin === true).length
  return { trades: rows.length, wins, winRate: toPct(wins, rows.length) }
}

export function calculateWinRate(rows: TradeMemoryRow[]) {
  const overall = winRateFor(rows)
  const bySymbol: Record<string, WinRateStat> = {}
  const byRegime: Record<string, WinRateStat> = {}
  const byConfidenceBucket: Record<string, WinRateStat> = {}

  const symbolGroups = new Map<string, TradeMemoryRow[]>()
  const regimeGroups = new Map<string, TradeMemoryRow[]>()
  const confGroups = new Map<string, TradeMemoryRow[]>()
  for (const row of rows) {
    const symbol = row.symbol || "UNKNOWN"
    const regime = row.marketRegime || "UNKNOWN"
    const bucket = confidenceBucket(row.rawConfidence)
    symbolGroups.set(symbol, [...(symbolGroups.get(symbol) ?? []), row])
    regimeGroups.set(regime, [...(regimeGroups.get(regime) ?? []), row])
    confGroups.set(bucket, [...(confGroups.get(bucket) ?? []), row])
  }
  for (const [key, group] of symbolGroups) bySymbol[key] = winRateFor(group)
  for (const [key, group] of regimeGroups) byRegime[key] = winRateFor(group)
  for (const [key, group] of confGroups) byConfidenceBucket[key] = winRateFor(group)

  return { overall, bySymbol, byRegime, byConfidenceBucket }
}

function calculateWinRateByConfidence(
  rows: TradeMemoryRow[],
  field: "rawConfidence" | "calibratedConfidence"
): Record<string, WinRateStat> {
  const groups = new Map<string, TradeMemoryRow[]>()
  for (const row of rows) {
    const value = field === "rawConfidence" ? row.rawConfidence : row.calibratedConfidence
    const bucket = field === "rawConfidence" ? confidenceBucket(value) : confidenceBucketCalibrated(value)
    groups.set(bucket, [...(groups.get(bucket) ?? []), row])
  }
  const out: Record<string, WinRateStat> = {}
  for (const [k, v] of groups) out[k] = winRateFor(v)
  return out
}

export function calculatePnLStats(rows: TradeMemoryRow[]) {
  const pnl = rows.map((r) => r.pnlUsd).filter((v): v is number => typeof v === "number" && Number.isFinite(v))
  const holds = rows
    .map((r) => r.holdDurationMs)
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v))
  const byRegime: Record<string, { trades: number; avgPnl: number }> = {}
  const regimeGroups = new Map<string, number[]>()
  for (const row of rows) {
    if (typeof row.pnlUsd !== "number" || !Number.isFinite(row.pnlUsd)) continue
    const key = row.marketRegime || "UNKNOWN"
    regimeGroups.set(key, [...(regimeGroups.get(key) ?? []), row.pnlUsd])
  }
  for (const [key, group] of regimeGroups) {
    byRegime[key] = { trades: group.length, avgPnl: toFixedNum(avg(group), 4) }
  }

  return {
    tradesWithPnl: pnl.length,
    totalRealizedPnl: toFixedNum(pnl.reduce((s, v) => s + v, 0), 4),
    averagePnl: toFixedNum(avg(pnl), 4),
    largestWin: toFixedNum(pnl.length ? Math.max(...pnl) : 0, 4),
    largestLoss: toFixedNum(pnl.length ? Math.min(...pnl) : 0, 4),
    averageHoldDurationMs: Math.round(avg(holds)),
    averagePnlByRegime: byRegime,
  }
}

export function calculateConfidenceStats(rows: TradeMemoryRow[]) {
  const makeTrack = (field: "rawConfidence" | "calibratedConfidence") => {
    const wins = rows.filter((r) => r.wasWin === true && typeof r[field] === "number")
    const losses = rows.filter((r) => r.wasWin === false && typeof r[field] === "number")
    const highestConfidenceLosses = rows
      .filter((r) => r.wasWin === false && typeof r[field] === "number")
      .sort((a, b) => ((b[field] as number) ?? 0) - ((a[field] as number) ?? 0))
      .slice(0, 5)
      .map((r) => ({
        symbol: r.symbol,
        confidence: r[field],
        pnlUsd: r.pnlUsd,
        marketRegime: r.marketRegime,
        createdAt: r.createdAt,
        sessionId: r.sessionId,
      }))
    const lowestConfidenceWins = rows
      .filter((r) => r.wasWin === true && typeof r[field] === "number")
      .sort((a, b) => ((a[field] as number) ?? 0) - ((b[field] as number) ?? 0))
      .slice(0, 5)
      .map((r) => ({
        symbol: r.symbol,
        confidence: r[field],
        pnlUsd: r.pnlUsd,
        marketRegime: r.marketRegime,
        createdAt: r.createdAt,
        sessionId: r.sessionId,
      }))
    return {
      averageConfidenceOnWins: toFixedNum(avg(wins.map((r) => r[field] as number)), 4),
      averageConfidenceOnLosses: toFixedNum(avg(losses.map((r) => r[field] as number)), 4),
      highestConfidenceLosses,
      lowestConfidenceWins,
      byConfidenceBucket: calculateWinRateByConfidence(rows, field),
    }
  }

  return {
    raw: makeTrack("rawConfidence"),
    calibrated: makeTrack("calibratedConfidence"),
    calibrationEffectivenessDelta: {
      avgWinConfidenceDelta: toFixedNum(
        makeTrack("calibratedConfidence").averageConfidenceOnWins - makeTrack("rawConfidence").averageConfidenceOnWins,
        4
      ),
      avgLossConfidenceDelta: toFixedNum(
        makeTrack("calibratedConfidence").averageConfidenceOnLosses - makeTrack("rawConfidence").averageConfidenceOnLosses,
        4
      ),
    },
  }
}

export function calculateSignalPerformance(rows: TradeMemoryRow[]) {
  const signalKeys = [
    { key: "kalmanScore", label: "kalmanScore" },
    { key: "liquidityScore", label: "liquidityScore" },
    { key: "sentimentScore", label: "sentimentScore" },
    { key: "raceScore", label: "raceScore" },
  ] as const

  const result: Record<
    string,
    {
      samples: number
      winRate: number
      avgPnl: number
      avgScoreOnWins: number
      avgScoreOnLosses: number
      correlationToPnl: number | null
      correlationToWin: number | null
    }
  > = {}

  for (const signal of signalKeys) {
    const valid = rows.filter((r) => {
      const score = r[signal.key]
      return typeof score === "number" && Number.isFinite(score)
    })
    const wins = valid.filter((r) => r.wasWin === true)
    const losses = valid.filter((r) => r.wasWin === false)
    const pnlRows = valid.filter((r) => typeof r.pnlUsd === "number" && Number.isFinite(r.pnlUsd))
    const xsPnl = pnlRows.map((r) => r[signal.key] as number)
    const ysPnl = pnlRows.map((r) => r.pnlUsd as number)
    const winRows = valid.filter((r) => typeof r.wasWin === "boolean")
    const xsWin = winRows.map((r) => r[signal.key] as number)
    const ysWin = winRows.map((r) => (r.wasWin ? 1 : 0))

    result[signal.label] = {
      samples: valid.length,
      winRate: toPct(wins.length, valid.length),
      avgPnl: toFixedNum(avg(pnlRows.map((r) => r.pnlUsd as number)), 4),
      avgScoreOnWins: toFixedNum(avg(wins.map((r) => r[signal.key] as number)), 4),
      avgScoreOnLosses: toFixedNum(avg(losses.map((r) => r[signal.key] as number)), 4),
      correlationToPnl: correlation(xsPnl, ysPnl),
      correlationToWin: correlation(xsWin, ysWin),
    }
  }

  return result
}

export function calculateRegimePerformance(rows: TradeMemoryRow[]) {
  const regimes: MarketRegime[] = ["TRENDING", "CHOPPING", "VOLATILE", "SIDEWAYS", "UNKNOWN"]
  const output: Record<string, { trades: number; winRate: number; avgPnl: number; totalPnl: number }> = {}
  for (const regime of regimes) {
    const regimeRows = rows.filter((r) => r.marketRegime === regime)
    const pnl = regimeRows
      .map((r) => r.pnlUsd)
      .filter((v): v is number => typeof v === "number" && Number.isFinite(v))
    const wins = regimeRows.filter((r) => r.wasWin === true).length
    output[regime] = {
      trades: regimeRows.length,
      winRate: toPct(wins, regimeRows.length),
      avgPnl: toFixedNum(avg(pnl), 4),
      totalPnl: toFixedNum(pnl.reduce((s, v) => s + v, 0), 4),
    }
  }
  return output
}

async function resolveSessionIdsForUser(userId: string): Promise<string[]> {
  const admin = requireAdmin()
  const { data, error } = await admin.from("TradeSession").select("id").eq("userId", userId).limit(5000)
  if (error) {
    console.error("[trade-analytics] DB_READ_FAILED: TradeSession user scope:", error.message)
    throw new Error(`DB_READ_FAILED: TradeSession user scope — ${error.message}`)
  }
  return (data ?? [])
    .map((r) => (typeof r.id === "string" ? r.id : ""))
    .filter((id) => id.length > 0)
}

function confidenceAccuracyScore(rows: TradeMemoryRow[]): number {
  const hi = rows.filter((r) => typeof r.rawConfidence === "number" && (r.rawConfidence as number) >= 75)
  const lo = rows.filter((r) => typeof r.rawConfidence === "number" && (r.rawConfidence as number) < 40)
  const hiWr = winRateFor(hi).winRate
  const loWr = winRateFor(lo).winRate
  return toFixedNum(hiWr - loWr, 2)
}

export async function queryTradeAnalytics(filters: TradeAnalyticsFilters = {}): Promise<TradeAnalyticsSummary> {
  let sessionIds: string[] | undefined
  if (filters.userId) {
    sessionIds = await resolveSessionIdsForUser(filters.userId)
    if (sessionIds.length === 0) {
      return {
        filters,
        trades: 0,
        winRate: calculateWinRate([]),
        pnl: calculatePnLStats([]),
        confidence: calculateConfidenceStats([]),
        signalPerformance: calculateSignalPerformance([]),
        regimePerformance: calculateRegimePerformance([]),
      }
    }
  }

  const query: QueryTradeMemoryParams = {
    symbol: filters.symbol,
    regime: filters.regime,
    from: filters.from,
    to: filters.to,
    wasWin: filters.wasWin,
    minConfidence: filters.minConfidence,
    maxConfidence: filters.maxConfidence,
    sessionIds,
    limit: filters.limit ?? 1000,
  }
  const rows = await queryTradeMemory(query)
  const filteredRows =
    typeof filters.minCalibratedConfidence === "number" || typeof filters.maxCalibratedConfidence === "number"
      ? rows.filter((row) => {
          const c = row.calibratedConfidence
          if (typeof c !== "number" || !Number.isFinite(c)) return false
          if (typeof filters.minCalibratedConfidence === "number" && c < filters.minCalibratedConfidence) return false
          if (typeof filters.maxCalibratedConfidence === "number" && c > filters.maxCalibratedConfidence) return false
          return true
        })
      : rows
  const summary: TradeAnalyticsSummary = {
    filters,
    trades: filteredRows.length,
    winRate: calculateWinRate(filteredRows),
    pnl: calculatePnLStats(filteredRows),
    confidence: calculateConfidenceStats(filteredRows),
    signalPerformance: calculateSignalPerformance(filteredRows),
    regimePerformance: calculateRegimePerformance(filteredRows),
  }
  console.log(
    `[trade-analytics] trades=${summary.trades} winRate=${summary.winRate.overall.winRate.toFixed(2)} avgPnl=${summary.pnl.averagePnl.toFixed(4)} confidenceAccuracy=${confidenceAccuracyScore(filteredRows).toFixed(2)}`
  )
  return summary
}
