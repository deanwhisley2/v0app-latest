import { randomUUID } from "crypto"
import { createAdminClient } from "@/lib/supabaseAdmin"
import type {
  ChatMessage,
  JoelinCoin,
  TradeOrder,
  TradeSession,
} from "@/lib/expert/phase2-types"

type AnalysisRow = {
  id: string
  userId: string
  symbol: string
  timeWindow: number
  action: "BUY" | "SELL" | "HOLD"
  /**
   * Legacy transitional field: historically this carried raw confidence.
   * New writes should treat this as canonical calibrated confidence for execution compatibility.
   */
  confidence: number
  rawConfidence?: number
  calibratedConfidence?: number
  confidenceExplanation?: {
    raw: number
    historicalFactor: number
    regimePenalty: number
    recentPenalty: number
    final: number
    sampleSize: number
  }
  reasons: string[]
  entryPrice?: number
  timestamp: string
  tradeExecuted: boolean
  tradeResult?: unknown
  cancelled?: boolean
  /** Max age (seconds) before execution rejects analysis as stale; see computeAnalysisTtlSeconds */
  ttlSeconds?: number
}

type NotificationRow = {
  id: string
  userId: string
  analysisId: string
  symbol: string
  action: string
  confidence: number
  read: boolean
  deleted: boolean
  createdAt: string
}

const g = globalThis as unknown as {
  __phase2?: {
    analyses: Map<string, AnalysisRow>
    notifications: Map<string, NotificationRow>
    sessions: Map<string, TradeSession>
    orders: Map<string, TradeOrder[]>
    chats: Map<string, ChatMessage[]>
    joelin: JoelinCoin[]
  }
}

/** Liquid USDT spot majors — refreshed live in `/api/joelin/oscillator`. */
const JOELIN_BASE_SYMBOLS = [
  "BTCUSDT",
  "ETHUSDT",
  "SOLUSDT",
  "BNBUSDT",
  "XRPUSDT",
  "DOGEUSDT",
  "ADAUSDT",
  "AVAXUSDT",
  "LINKUSDT",
  "DOTUSDT",
  "TRXUSDT",
  "LTCUSDT",
]

function initJoelin(): JoelinCoin[] {
  const now = Date.now()
  const next = new Date(now + 300_000).toISOString()
  return JOELIN_BASE_SYMBOLS.map((symbol, idx) => ({
    symbol,
    action: idx % 3 === 0 ? "BUY" : idx % 3 === 1 ? "SELL" : "HOLD",
    confidence: 62 + idx * 6,
    safetyLevel: idx % 3 === 0 ? "HIGH" : idx % 3 === 1 ? "MEDIUM" : "LOW",
    tradableLevel: 55 + idx * 8,
    lastAnalysis: new Date(now).toISOString(),
    nextAnalysis: next,
    price: 100 + idx * 10,
    volume24h: 1000000 + idx * 250000,
    volatility: 1.1 + idx * 0.4,
  }))
}

/** In-process read cache only — populated after successful DB writes or DB reads. */
export const phase2Store =
  g.__phase2 ??
  (g.__phase2 = {
    analyses: new Map<string, AnalysisRow>(),
    notifications: new Map<string, NotificationRow>(),
    sessions: new Map<string, TradeSession>(),
    orders: new Map<string, TradeOrder[]>(),
    chats: new Map<string, ChatMessage[]>(),
    joelin: initJoelin(),
  })

export function makeId(prefix: string): string {
  return `${prefix}_${randomUUID()}`
}

function requireAdmin() {
  try {
    return createAdminClient()
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error("[phase2] DB_WRITE_FAILED: admin client unavailable:", msg)
    throw new Error(`DB_WRITE_FAILED: ${msg}`)
  }
}

export async function createAnalysis(data: {
  id: string
  userId: string
  symbol: string
  timeWindow: number
  action: "BUY" | "SELL" | "HOLD"
  confidence: number
  rawConfidence?: number
  calibratedConfidence?: number
  confidenceExplanation?: {
    raw: number
    historicalFactor: number
    regimePenalty: number
    recentPenalty: number
    final: number
    sampleSize: number
  }
  reasons: string[]
  entryPrice?: number
  tradeExecuted: boolean
  ttlSeconds: number
}) {
  const row: AnalysisRow = {
    ...data,
    timestamp: new Date().toISOString(),
  }
  const admin = requireAdmin()
  const { error } = await admin.from("AnalysisHistory").insert({
    id: row.id,
    userId: row.userId,
    symbol: row.symbol,
    timeWindow: row.timeWindow,
    action: row.action,
    confidence: row.confidence,
    rawConfidence: row.rawConfidence ?? row.confidence,
    calibratedConfidence: row.calibratedConfidence ?? row.confidence,
    confidenceExplanation: row.confidenceExplanation ?? null,
    reasons: row.reasons,
    entryPrice: row.entryPrice ?? null,
    tradeExecuted: row.tradeExecuted,
    ttlSeconds: row.ttlSeconds,
  })
  if (error) {
    console.error("[phase2] createAnalysis DB_WRITE_FAILED:", error.message)
    throw new Error(`DB_WRITE_FAILED: AnalysisHistory insert — ${error.message}`)
  }
  phase2Store.analyses.set(row.id, row)
  return row
}

export async function getAnalysisById(id: string): Promise<AnalysisRow | null> {
  const admin = requireAdmin()
  const { data, error } = await admin
    .from("AnalysisHistory")
    .select("*")
    .eq("id", id)
    .maybeSingle()
  if (error) {
    console.error("[phase2] getAnalysisById DB_READ_FAILED:", error.message)
    throw new Error(`DB_READ_FAILED: AnalysisHistory select — ${error.message}`)
  }
  if (!data) return null
  const mapped: AnalysisRow = {
    id: data.id,
    userId: data.userId,
    symbol: data.symbol,
    timeWindow: data.timeWindow,
    action: data.action,
    confidence: data.confidence,
    rawConfidence:
      typeof data.rawConfidence === "number" && Number.isFinite(data.rawConfidence)
        ? data.rawConfidence
        : data.confidence,
    calibratedConfidence:
      typeof data.calibratedConfidence === "number" && Number.isFinite(data.calibratedConfidence)
        ? data.calibratedConfidence
        : data.confidence,
    confidenceExplanation:
      data.confidenceExplanation &&
      typeof data.confidenceExplanation === "object" &&
      typeof data.confidenceExplanation.final === "number"
        ? data.confidenceExplanation
        : undefined,
    reasons: data.reasons ?? [],
    entryPrice: data.entryPrice ?? undefined,
    timestamp: data.timestamp,
    tradeExecuted: data.tradeExecuted ?? false,
    ttlSeconds:
      typeof data.ttlSeconds === "number" && Number.isFinite(data.ttlSeconds)
        ? data.ttlSeconds
        : undefined,
  }
  phase2Store.analyses.set(id, mapped)
  return mapped
}

export async function createNotification(row: NotificationRow) {
  const admin = requireAdmin()
  const { error } = await admin.from("NotificationRecord").insert(row)
  if (error) {
    console.error("[phase2] createNotification DB_WRITE_FAILED:", error.message)
    throw new Error(`DB_WRITE_FAILED: NotificationRecord insert — ${error.message}`)
  }
  phase2Store.notifications.set(row.id, row)
}

export async function createSession(session: TradeSession) {
  const admin = requireAdmin()
  const { error } = await admin.from("TradeSession").insert({
    id: session.id,
    userId: session.userId,
    symbol: session.symbol,
    mode: session.mode,
    status: session.status,
    totalAmount: session.totalAmount,
    usedAmount: session.usedAmount,
    startTime: session.startTime,
    endTime: session.endTime ?? null,
    config: session.config,
  })
  if (error) {
    console.error("[phase2] createSession DB_WRITE_FAILED:", error.message)
    throw new Error(`DB_WRITE_FAILED: TradeSession insert — ${error.message}`)
  }
  phase2Store.sessions.set(session.id, session)
}

export async function listTradeSessionsForUser(userId: string, limit = 100): Promise<TradeSession[]> {
  const admin = requireAdmin()
  const { data, error } = await admin
    .from("TradeSession")
    .select("*")
    .eq("userId", userId)
    .order("startTime", { ascending: false })
    .limit(limit)
  if (error) {
    console.error("[phase2] listTradeSessionsForUser DB_READ_FAILED:", error.message)
    throw new Error(`DB_READ_FAILED: TradeSession list — ${error.message}`)
  }
  const rows = data ?? []
  return rows.map(
    (row: Record<string, unknown>) =>
      ({
        id: row.id,
        userId: row.userId,
        symbol: row.symbol,
        mode: row.mode,
        status: row.status,
        totalAmount: row.totalAmount,
        usedAmount: row.usedAmount,
        startTime: row.startTime,
        endTime: row.endTime ?? undefined,
        config: row.config,
      }) as TradeSession
  )
}

export async function getSessionById(sessionId: string): Promise<TradeSession | null> {
  const admin = requireAdmin()
  const { data, error } = await admin.from("TradeSession").select("*").eq("id", sessionId).maybeSingle()
  if (error) {
    console.error("[phase2] getSessionById DB_READ_FAILED:", error.message)
    throw new Error(`DB_READ_FAILED: TradeSession select — ${error.message}`)
  }
  if (!data) return null
  const mapped = {
    id: data.id,
    userId: data.userId,
    symbol: data.symbol,
    mode: data.mode,
    status: data.status,
    totalAmount: data.totalAmount,
    usedAmount: data.usedAmount,
    startTime: data.startTime,
    endTime: data.endTime ?? undefined,
    config: data.config,
  } as TradeSession
  phase2Store.sessions.set(sessionId, mapped)
  return mapped
}

export async function updateSession(sessionId: string, patch: Partial<TradeSession>) {
  const existing = await getSessionById(sessionId)
  if (!existing) return null
  const next: TradeSession = { ...existing, ...patch }
  const admin = requireAdmin()
  const { error } = await admin
    .from("TradeSession")
    .update({
      status: next.status,
      usedAmount: next.usedAmount,
      endTime: next.endTime ?? null,
      config: next.config,
    })
    .eq("id", sessionId)
  if (error) {
    console.error("[phase2] updateSession DB_WRITE_FAILED:", error.message)
    throw new Error(`DB_WRITE_FAILED: TradeSession update — ${error.message}`)
  }
  phase2Store.sessions.set(sessionId, next)
  return next
}

export async function upsertOrders(sessionId: string, orders: TradeOrder[]) {
  if (orders.length === 0) {
    phase2Store.orders.set(sessionId, [])
    return
  }
  const admin = requireAdmin()
  const { error } = await admin.from("TradeOrder").insert(orders)
  if (error) {
    console.error("[phase2] upsertOrders DB_WRITE_FAILED:", error.message)
    throw new Error(`DB_WRITE_FAILED: TradeOrder insert — ${error.message}`)
  }
  phase2Store.orders.set(sessionId, orders)
}

export async function getOrdersBySession(sessionId: string): Promise<TradeOrder[]> {
  const admin = requireAdmin()
  const { data, error } = await admin.from("TradeOrder").select("*").eq("sessionId", sessionId).order("createdAt")
  if (error) {
    console.error("[phase2] getOrdersBySession DB_READ_FAILED:", error.message)
    throw new Error(`DB_READ_FAILED: TradeOrder select — ${error.message}`)
  }
  const list = (data ?? []) as TradeOrder[]
  phase2Store.orders.set(sessionId, list)
  return list
}

function mapExpertChatRowToMessage(row: Record<string, unknown>): ChatMessage {
  return {
    id: String(row.id),
    sessionId: String(row.sessionId),
    timestamp:
      typeof row.timestamp === "string"
        ? row.timestamp
        : row.timestamp
          ? new Date(row.timestamp as string).toISOString()
          : new Date().toISOString(),
    type: row.type as ChatMessage["type"],
    content: String(row.content ?? ""),
    data: row.data && typeof row.data === "object" ? (row.data as ChatMessage["data"]) : undefined,
  }
}

async function fetchChatMessagesFromDatabase(sessionId: string): Promise<ChatMessage[]> {
  const admin = requireAdmin()
  const { data, error } = await admin
    .from("ExpertChatMessage")
    .select("*")
    .eq("sessionId", sessionId)
    .order("timestamp", { ascending: true })
  if (error) {
    console.error("[phase2] ExpertChatMessage select DB_READ_FAILED:", error.message)
    throw new Error(`DB_READ_FAILED: ExpertChatMessage select — ${error.message}`)
  }
  return (data ?? []).map((r) => mapExpertChatRowToMessage(r as Record<string, unknown>))
}

/** Loads chat from DB and refreshes read cache. */
export async function listChatMessagesForSession(sessionId: string): Promise<ChatMessage[]> {
  const merged = await fetchChatMessagesFromDatabase(sessionId)
  phase2Store.chats.set(sessionId, merged)
  return merged
}

export async function clearChatMessagesForSession(sessionId: string) {
  const admin = requireAdmin()
  const { error } = await admin.from("ExpertChatMessage").delete().eq("sessionId", sessionId)
  if (error) {
    console.error("[phase2] clearChatMessagesForSession DB_WRITE_FAILED:", error.message)
    throw new Error(`DB_WRITE_FAILED: ExpertChatMessage delete — ${error.message}`)
  }
  phase2Store.chats.set(sessionId, [])
}

export async function appendChatMessage(sessionId: string, message: Omit<ChatMessage, "id" | "timestamp" | "sessionId">) {
  const row: ChatMessage = {
    id: makeId("msg"),
    sessionId,
    timestamp: new Date().toISOString(),
    ...message,
  }
  const admin = requireAdmin()
  const session = await getSessionById(sessionId)
  const userId = session?.userId
  if (!userId) {
    console.error("[phase2] appendChatMessage DB_WRITE_FAILED: session not found:", sessionId)
    throw new Error(`DB_WRITE_FAILED: ExpertChatMessage insert — session ${sessionId} not found`)
  }
  const { error } = await admin.from("ExpertChatMessage").insert({
    id: row.id,
    sessionId: row.sessionId,
    userId,
    timestamp: row.timestamp,
    type: row.type,
    content: row.content,
    data: row.data ?? null,
  })
  if (error) {
    console.error("[phase2] ExpertChatMessage insert DB_WRITE_FAILED:", error.message)
    throw new Error(`DB_WRITE_FAILED: ExpertChatMessage insert — ${error.message}`)
  }
  const list = phase2Store.chats.get(sessionId) ?? []
  phase2Store.chats.set(sessionId, [...list, row])
  return row
}

export async function getSessionSummary(sessionId: string) {
  const orders = await getOrdersBySession(sessionId)
  const totalBuys = orders.filter((o) => o.type === "BUY").length
  const totalSells = orders.filter((o) => o.type === "SELL").length
  const buyAmount = orders.filter((o) => o.type === "BUY").reduce((acc, o) => acc + o.quoteAmount, 0)
  const sellAmount = orders.filter((o) => o.type === "SELL").reduce((acc, o) => acc + o.quoteAmount, 0)
  const pnl = sellAmount - buyAmount
  const winRate = totalSells > 0 ? Math.round((Math.max(0, pnl) / Math.max(1, sellAmount)) * 100) : 0
  return { totalBuys, totalSells, currentPnl: pnl, winRate }
}
