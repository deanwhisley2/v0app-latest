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
  confidence: number
  reasons: string[]
  entryPrice?: number
  timestamp: string
  tradeExecuted: boolean
  tradeResult?: unknown
  cancelled?: boolean
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

export function getUserId(): string {
  // TODO: wire real auth identity from session.
  return "demo-user"
}

function adminOrNull() {
  try {
    return createAdminClient()
  } catch {
    return null
  }
}

export async function createAnalysis(data: {
  id: string
  userId: string
  symbol: string
  timeWindow: number
  action: "BUY" | "SELL" | "HOLD"
  confidence: number
  reasons: string[]
  entryPrice?: number
  tradeExecuted: boolean
}) {
  const row: AnalysisRow = {
    ...data,
    timestamp: new Date().toISOString(),
  }
  const admin = adminOrNull()
  if (admin) {
    const { error } = await admin.from("AnalysisHistory").insert({
      id: row.id,
      userId: row.userId,
      symbol: row.symbol,
      timeWindow: row.timeWindow,
      action: row.action,
      confidence: row.confidence,
      reasons: row.reasons,
      entryPrice: row.entryPrice ?? null,
      tradeExecuted: row.tradeExecuted,
    })
    if (error) {
      console.warn("[phase2] createAnalysis fallback:", error.message)
      phase2Store.analyses.set(row.id, row)
      return row
    }
    phase2Store.analyses.set(row.id, row)
    return row
  }
  phase2Store.analyses.set(row.id, row)
  return row
}

export async function getAnalysisById(id: string): Promise<AnalysisRow | null> {
  const admin = adminOrNull()
  if (admin) {
    const { data, error } = await admin
      .from("AnalysisHistory")
      .select("*")
      .eq("id", id)
      .maybeSingle()
    if (!error && data) {
      return {
        id: data.id,
        userId: data.userId,
        symbol: data.symbol,
        timeWindow: data.timeWindow,
        action: data.action,
        confidence: data.confidence,
        reasons: data.reasons ?? [],
        entryPrice: data.entryPrice ?? undefined,
        timestamp: data.timestamp,
        tradeExecuted: data.tradeExecuted ?? false,
      }
    }
  }
  return phase2Store.analyses.get(id) ?? null
}

export async function createNotification(row: NotificationRow) {
  const admin = adminOrNull()
  if (admin) {
    const { error } = await admin.from("NotificationRecord").insert(row)
    if (error) {
      console.warn("[phase2] createNotification fallback:", error.message)
    }
  }
  phase2Store.notifications.set(row.id, row)
}

export async function createSession(session: TradeSession) {
  const admin = adminOrNull()
  if (admin) {
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
      console.warn("[phase2] createSession fallback:", error.message)
    }
  }
  phase2Store.sessions.set(session.id, session)
}

export async function listTradeSessionsForUser(userId: string, limit = 100): Promise<TradeSession[]> {
  const admin = adminOrNull()
  if (admin) {
    const { data, error } = await admin
      .from("TradeSession")
      .select("*")
      .eq("userId", userId)
      .order("startTime", { ascending: false })
      .limit(limit)
    if (!error && data?.length) {
      return data.map(
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
  }
  return Array.from(phase2Store.sessions.values())
    .filter((s) => s.userId === userId)
    .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
    .slice(0, limit)
}

export async function getSessionById(sessionId: string): Promise<TradeSession | null> {
  const admin = adminOrNull()
  if (admin) {
    const { data, error } = await admin.from("TradeSession").select("*").eq("id", sessionId).maybeSingle()
    if (!error && data) {
      return {
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
    }
  }
  return phase2Store.sessions.get(sessionId) ?? null
}

export async function updateSession(sessionId: string, patch: Partial<TradeSession>) {
  const existing = (await getSessionById(sessionId)) ?? phase2Store.sessions.get(sessionId)
  if (!existing) return null
  const next: TradeSession = { ...existing, ...patch }
  const admin = adminOrNull()
  if (admin) {
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
      console.warn("[phase2] updateSession fallback:", error.message)
    }
  }
  phase2Store.sessions.set(sessionId, next)
  return next
}

export async function upsertOrders(sessionId: string, orders: TradeOrder[]) {
  const admin = adminOrNull()
  if (admin && orders.length > 0) {
    const { error } = await admin.from("TradeOrder").insert(orders)
    if (error) {
      console.warn("[phase2] upsertOrders fallback:", error.message)
    }
  }
  phase2Store.orders.set(sessionId, orders)
}

export async function getOrdersBySession(sessionId: string): Promise<TradeOrder[]> {
  const admin = adminOrNull()
  if (admin) {
    const { data, error } = await admin.from("TradeOrder").select("*").eq("sessionId", sessionId).order("createdAt")
    if (!error && data) {
      return data as TradeOrder[]
    }
  }
  return phase2Store.orders.get(sessionId) ?? []
}

export async function appendChatMessage(sessionId: string, message: Omit<ChatMessage, "id" | "timestamp" | "sessionId">) {
  const row: ChatMessage = {
    id: makeId("msg"),
    sessionId,
    timestamp: new Date().toISOString(),
    ...message,
  }
  // Chat persistence table can be added later; for now keep in memory and SSE-backed.
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
