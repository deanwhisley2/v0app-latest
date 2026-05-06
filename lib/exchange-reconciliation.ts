import { randomUUID } from "crypto"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { binanceGetOrder } from "@/lib/server/binance-signed-order"
import { resolveBinanceCredentialsForExecution } from "@/lib/expert/user-binance"

type DivergenceSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
type ReconcileStatus = "HEALTHY" | "RECONCILING" | "EXCHANGE_UNKNOWN" | "RECOVERY_REQUIRED" | "DIVERGED" | "RECOVERED"

type Divergence = {
  severity: DivergenceSeverity
  category: string
  divergence: string
  dbOrderId?: string
  exchangeOrderId?: string
  actionTaken?: string
  recoveryStatus: ReconcileStatus
  details?: Record<string, unknown>
}

function requireAdmin() {
  try {
    return createAdminClient()
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new Error(`DB_READ_FAILED: ${msg}`)
  }
}

async function logDivergence(userId: string, sessionId: string, symbol: string, d: Divergence) {
  const admin = requireAdmin()
  const { error } = await admin.from("ExchangeReconciliationLog").insert({
    id: `erl_${randomUUID()}`,
    userId,
    sessionId,
    symbol,
    severity: d.severity,
    category: d.category,
    dbOrderId: d.dbOrderId ?? null,
    exchangeOrderId: d.exchangeOrderId ?? null,
    divergence: d.divergence,
    actionTaken: d.actionTaken ?? null,
    recoveryStatus: d.recoveryStatus,
    details: d.details ?? null,
  })
  if (error) throw new Error(`DB_WRITE_FAILED: ExchangeReconciliationLog insert — ${error.message}`)
  console.log(
    `[exchange-divergence] sessionId=${sessionId} symbol=${symbol} severity=${d.severity} category=${d.category} status=${d.recoveryStatus}`
  )
}

function toTerminalStatus(status: string): "FILLED" | "FAILED" | "PENDING" {
  if (status === "FILLED") return "FILLED"
  if (["CANCELED", "REJECTED", "EXPIRED"].includes(status)) return "FAILED"
  return "PENDING"
}

async function markExecutionReconciliation(sessionId: string, status: ReconcileStatus, lastError?: string) {
  const admin = requireAdmin()
  const { error } = await admin
    .from("ExecutionState")
    .update({
      reconciliationStatus: status,
      lastReconciledAt: new Date().toISOString(),
      ...(lastError ? { lastError } : {}),
    })
    .eq("sessionId", sessionId)
  if (error) throw new Error(`DB_WRITE_FAILED: ExecutionState reconcile update — ${error.message}`)
}

/**
 * External truth hierarchy:
 * 1) Confirmed Binance order terminal state is authoritative for per-order reality.
 * 2) Internal lifecycle state is authoritative only when aligned with order-level exchange truth.
 * 3) On disagreement, reconciliation marks RECOVERY_REQUIRED/DIVERGED and performs only conservative repairs.
 */
export async function reconcileSessionWithExchange(input: {
  sessionId: string
  userId: string
  autoRepair?: boolean
}) {
  const admin = requireAdmin()
  const { data: session, error: sessionErr } = await admin
    .from("TradeSession")
    .select("*")
    .eq("id", input.sessionId)
    .maybeSingle()
  if (sessionErr) throw new Error(`DB_READ_FAILED: TradeSession read — ${sessionErr.message}`)
  if (!session) throw new Error("INVALID_REQUEST: session not found")
  if (session.userId !== input.userId) throw new Error("FORBIDDEN_SESSION: session belongs to another account")

  await markExecutionReconciliation(input.sessionId, "RECONCILING")
  console.log(`[exchange-reconcile] start sessionId=${input.sessionId} symbol=${session.symbol}`)

  const { data: orders, error: ordersErr } = await admin
    .from("TradeOrder")
    .select("*")
    .eq("sessionId", input.sessionId)
    .order("createdAt", { ascending: true })
  if (ordersErr) throw new Error(`DB_READ_FAILED: TradeOrder read — ${ordersErr.message}`)

  const credsPack = await resolveBinanceCredentialsForExecution(input.userId)
  const creds = credsPack.creds
  if (!creds?.apiKey || !creds?.apiSecret) {
    await markExecutionReconciliation(input.sessionId, "EXCHANGE_UNKNOWN", "Missing Binance credentials for reconciliation")
    throw new Error("MISSING_BINANCE_KEYS: reconciliation requires exchange credentials")
  }

  const divergences: Divergence[] = []
  for (const row of orders ?? []) {
    let exchangeOrder: Awaited<ReturnType<typeof binanceGetOrder>>
    try {
      exchangeOrder = await binanceGetOrder(session.symbol, Number(row.orderId), creds.apiKey, creds.apiSecret)
    } catch (e) {
      divergences.push({
        severity: "HIGH",
        category: "EXCHANGE_QUERY_FAILED",
        divergence: "Could not read exchange order state.",
        dbOrderId: row.id,
        exchangeOrderId: String(row.orderId),
        recoveryStatus: "EXCHANGE_UNKNOWN",
        details: { error: e instanceof Error ? e.message : String(e) },
      })
      continue
    }

    const exchangeTerminal = toTerminalStatus(exchangeOrder.status)
    const dbTerminal = row.status === "FILLED" ? "FILLED" : row.status === "FAILED" ? "FAILED" : "PENDING"
    if (exchangeTerminal !== dbTerminal) {
      const details = {
        dbStatus: row.status,
        exchangeStatus: exchangeOrder.status,
        dbExecutedQty: row.quantity,
        exchangeExecutedQty: Number.parseFloat(exchangeOrder.executedQty || "0"),
      }
      let actionTaken: string | undefined
      if (input.autoRepair && exchangeTerminal === "FILLED") {
        const executedQty = Number.parseFloat(exchangeOrder.executedQty || "0")
        const quote = Number.parseFloat(exchangeOrder.cummulativeQuoteQty || "0")
        const price = executedQty > 0 ? quote / executedQty : row.price
        const { error: upErr } = await admin
          .from("TradeOrder")
          .update({
            status: "FILLED",
            quantity: executedQty || row.quantity,
            quoteAmount: quote || row.quoteAmount,
            price,
            filledAt: row.filledAt ?? new Date().toISOString(),
          })
          .eq("id", row.id)
        if (!upErr) actionTaken = "DB order patched to FILLED from exchange terminal truth."
      }
      divergences.push({
        severity: exchangeTerminal === "FILLED" ? "CRITICAL" : "HIGH",
        category: "ORDER_STATUS_MISMATCH",
        divergence: "DB order status differs from exchange terminal status.",
        dbOrderId: row.id,
        exchangeOrderId: String(row.orderId),
        actionTaken,
        recoveryStatus: actionTaken ? "RECOVERED" : "RECOVERY_REQUIRED",
        details,
      })
    }
  }

  const buys = (orders ?? []).filter((o) => o.type === "BUY" && o.status === "FILLED").reduce((s, o) => s + o.quantity, 0)
  const sells = (orders ?? []).filter((o) => o.type === "SELL" && o.status === "FILLED").reduce((s, o) => s + o.quantity, 0)
  const netQty = Math.max(0, buys - sells)
  const { data: pos, error: posErr } = await admin
    .from("PositionState")
    .select("*")
    .eq("userId", input.userId)
    .eq("symbol", session.symbol)
    .maybeSingle()
  if (posErr) throw new Error(`DB_READ_FAILED: PositionState read — ${posErr.message}`)
  const dbLong = (pos?.status ?? "FLAT") === "LONG"
  if ((netQty > 0) !== dbLong) {
    divergences.push({
      severity: "CRITICAL",
      category: "POSITION_MISMATCH",
      divergence: "Net filled quantity disagrees with PositionState LONG/FLAT.",
      recoveryStatus: "RECOVERY_REQUIRED",
      details: { netQty, positionStatus: pos?.status ?? "NONE" },
    })
  }

  for (const d of divergences) await logDivergence(input.userId, input.sessionId, session.symbol, d)

  const finalStatus: ReconcileStatus =
    divergences.length === 0
      ? "HEALTHY"
      : divergences.some((d) => d.recoveryStatus === "RECOVERY_REQUIRED")
        ? "RECOVERY_REQUIRED"
        : divergences.some((d) => d.recoveryStatus === "EXCHANGE_UNKNOWN")
          ? "EXCHANGE_UNKNOWN"
          : divergences.every((d) => d.recoveryStatus === "RECOVERED")
            ? "RECOVERED"
            : "DIVERGED"
  await markExecutionReconciliation(input.sessionId, finalStatus)
  console.log(`[exchange-reconcile] complete sessionId=${input.sessionId} symbol=${session.symbol} status=${finalStatus}`)
  return { sessionId: input.sessionId, symbol: session.symbol, status: finalStatus, divergences }
}

export async function reconcileIncompleteSessions(input: { userId: string; maxAgeMinutes?: number; autoRepair?: boolean }) {
  const admin = requireAdmin()
  const maxAgeMinutes = Math.max(1, input.maxAgeMinutes ?? 30)
  const cutoff = new Date(Date.now() - maxAgeMinutes * 60_000).toISOString()
  const { data, error } = await admin
    .from("TradeSession")
    .select("*")
    .eq("userId", input.userId)
    .in("status", ["PENDING", "ACTIVE"])
    .lt("startTime", cutoff)
    .order("startTime", { ascending: true })
    .limit(50)
  if (error) throw new Error(`DB_READ_FAILED: list incomplete sessions — ${error.message}`)
  const sessions = data ?? []
  const out = []
  for (const s of sessions) {
    console.log(`[recovery-start] sessionId=${s.id} symbol=${s.symbol} reason=incomplete-lifecycle`)
    try {
      const result = await reconcileSessionWithExchange({
        sessionId: s.id,
        userId: input.userId,
        autoRepair: input.autoRepair,
      })
      out.push(result)
      console.log(`[recovery-complete] sessionId=${s.id} symbol=${s.symbol} status=${result.status}`)
    } catch (e) {
      console.error(`[recovery-failed] sessionId=${s.id} symbol=${s.symbol} error=${e instanceof Error ? e.message : String(e)}`)
      out.push({ sessionId: s.id, symbol: s.symbol, status: "DIVERGED", error: e instanceof Error ? e.message : String(e) })
    }
  }
  return out
}
