import { randomUUID } from "crypto"
import { createAdminClient } from "@/lib/supabaseAdmin"

export type MarketRegime = "TRENDING" | "CHOPPING" | "VOLATILE" | "SIDEWAYS" | "UNKNOWN"
export type TradeDecision = "BUY" | "SELL" | "HOLD"

export type TradeMemoryRow = {
  id: string
  createdAt: string
  symbol: string
  marketRegime: MarketRegime
  decision: TradeDecision
  rawConfidence: number | null
  calibratedConfidence: number | null
  signalStreak: number | null
  kalmanScore: number | null
  liquidityScore: number | null
  sentimentScore: number | null
  raceScore: number | null
  entryPrice: number | null
  exitPrice: number | null
  quantity: number | null
  pnlUsd: number | null
  holdDurationMs: number | null
  wasWin: boolean | null
  cooldownActive: boolean | null
  notes: string | null
  analysisId: string | null
  sessionId: string | null
}

export type CreateTradeMemoryInput = {
  id?: string
  symbol: string
  marketRegime?: MarketRegime
  decision: TradeDecision
  rawConfidence?: number | null
  calibratedConfidence?: number | null
  signalStreak?: number | null
  kalmanScore?: number | null
  liquidityScore?: number | null
  sentimentScore?: number | null
  raceScore?: number | null
  entryPrice?: number | null
  exitPrice?: number | null
  quantity?: number | null
  pnlUsd?: number | null
  holdDurationMs?: number | null
  wasWin?: boolean | null
  cooldownActive?: boolean | null
  notes?: string | null
  analysisId?: string | null
  sessionId?: string | null
}

export type QueryTradeMemoryParams = {
  symbol?: string
  regime?: MarketRegime
  from?: string
  to?: string
  wasWin?: boolean
  minConfidence?: number
  maxConfidence?: number
  sessionIds?: string[]
  limit?: number
}

function requireAdmin() {
  try {
    return createAdminClient()
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error("[trade-memory] DB_WRITE_FAILED: admin client unavailable:", msg)
    throw new Error(`DB_WRITE_FAILED: ${msg}`)
  }
}

function normalizeNumber(value: number | null | undefined): number | null {
  if (value == null) return null
  return Number.isFinite(value) ? value : null
}

function mapRow(data: Record<string, unknown>): TradeMemoryRow {
  return {
    id: String(data.id),
    createdAt: String(data.createdAt ?? new Date().toISOString()),
    symbol: String(data.symbol ?? ""),
    marketRegime: (data.marketRegime as MarketRegime) ?? "UNKNOWN",
    decision: (data.decision as TradeDecision) ?? "HOLD",
    rawConfidence: normalizeNumber(data.rawConfidence as number | null | undefined),
    calibratedConfidence: normalizeNumber(data.calibratedConfidence as number | null | undefined),
    signalStreak: normalizeNumber(data.signalStreak as number | null | undefined),
    kalmanScore: normalizeNumber(data.kalmanScore as number | null | undefined),
    liquidityScore: normalizeNumber(data.liquidityScore as number | null | undefined),
    sentimentScore: normalizeNumber(data.sentimentScore as number | null | undefined),
    raceScore: normalizeNumber(data.raceScore as number | null | undefined),
    entryPrice: normalizeNumber(data.entryPrice as number | null | undefined),
    exitPrice: normalizeNumber(data.exitPrice as number | null | undefined),
    quantity: normalizeNumber(data.quantity as number | null | undefined),
    pnlUsd: normalizeNumber(data.pnlUsd as number | null | undefined),
    holdDurationMs: normalizeNumber(data.holdDurationMs as number | null | undefined),
    wasWin: typeof data.wasWin === "boolean" ? data.wasWin : null,
    cooldownActive: typeof data.cooldownActive === "boolean" ? data.cooldownActive : null,
    notes: typeof data.notes === "string" ? data.notes : null,
    analysisId: typeof data.analysisId === "string" ? data.analysisId : null,
    sessionId: typeof data.sessionId === "string" ? data.sessionId : null,
  }
}

export async function createTradeMemory(input: CreateTradeMemoryInput): Promise<TradeMemoryRow> {
  const admin = requireAdmin()
  const row = {
    id: input.id ?? `tm_${randomUUID()}`,
    symbol: input.symbol,
    marketRegime: input.marketRegime ?? "UNKNOWN",
    decision: input.decision,
    rawConfidence: normalizeNumber(input.rawConfidence),
    calibratedConfidence: normalizeNumber(input.calibratedConfidence ?? input.rawConfidence ?? null),
    signalStreak: normalizeNumber(input.signalStreak),
    kalmanScore: normalizeNumber(input.kalmanScore),
    liquidityScore: normalizeNumber(input.liquidityScore),
    sentimentScore: normalizeNumber(input.sentimentScore),
    raceScore: normalizeNumber(input.raceScore),
    entryPrice: normalizeNumber(input.entryPrice),
    exitPrice: normalizeNumber(input.exitPrice),
    quantity: normalizeNumber(input.quantity),
    pnlUsd: normalizeNumber(input.pnlUsd),
    holdDurationMs: normalizeNumber(input.holdDurationMs),
    wasWin: typeof input.wasWin === "boolean" ? input.wasWin : null,
    cooldownActive: typeof input.cooldownActive === "boolean" ? input.cooldownActive : null,
    notes: input.notes ?? null,
    analysisId: input.analysisId ?? null,
    sessionId: input.sessionId ?? null,
  }
  const { data, error } = await admin.from("TradeMemory").insert(row).select("*").single()
  if (error) {
    console.error("[trade-memory] createTradeMemory DB_WRITE_FAILED:", error.message)
    throw new Error(`DB_WRITE_FAILED: TradeMemory insert — ${error.message}`)
  }
  return mapRow(data as Record<string, unknown>)
}

export async function getTradeMemory(id: string): Promise<TradeMemoryRow | null> {
  const admin = requireAdmin()
  const { data, error } = await admin.from("TradeMemory").select("*").eq("id", id).maybeSingle()
  if (error) {
    console.error("[trade-memory] getTradeMemory DB_READ_FAILED:", error.message)
    throw new Error(`DB_READ_FAILED: TradeMemory select — ${error.message}`)
  }
  if (!data) return null
  return mapRow(data as Record<string, unknown>)
}

export async function queryTradeMemory(params: QueryTradeMemoryParams = {}): Promise<TradeMemoryRow[]> {
  const admin = requireAdmin()
  let query = admin.from("TradeMemory").select("*").order("createdAt", { ascending: false })

  if (params.symbol) query = query.eq("symbol", params.symbol.toUpperCase())
  if (params.regime) query = query.eq("marketRegime", params.regime)
  if (typeof params.wasWin === "boolean") query = query.eq("wasWin", params.wasWin)
  if (params.from) query = query.gte("createdAt", params.from)
  if (params.to) query = query.lte("createdAt", params.to)
  if (typeof params.minConfidence === "number") query = query.gte("rawConfidence", params.minConfidence)
  if (typeof params.maxConfidence === "number") query = query.lte("rawConfidence", params.maxConfidence)
  if (params.sessionIds && params.sessionIds.length > 0) query = query.in("sessionId", params.sessionIds)
  query = query.limit(Math.max(1, Math.min(500, params.limit ?? 100)))

  const { data, error } = await query
  if (error) {
    console.error("[trade-memory] queryTradeMemory DB_READ_FAILED:", error.message)
    throw new Error(`DB_READ_FAILED: TradeMemory query — ${error.message}`)
  }
  return (data ?? []).map((row) => mapRow(row as Record<string, unknown>))
}
