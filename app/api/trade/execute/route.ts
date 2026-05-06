import { NextRequest, NextResponse } from "next/server"
import { externalApisBlockedResponse } from "@/lib/dev-local-api-guard"
import { assertRealTradeApiSecret } from "@/lib/server/trade-api-auth"
import { commanderDecide, executeOrder } from "@/lib/strategy-commander"
import type { TradeSignal } from "@/lib/trading-signal"
import { requestGovernanceApproval } from "@/lib/global-execution-governor"

async function fetchSpotPrice(symbol: string): Promise<number> {
  const u = new URL("https://api.binance.com/api/v3/ticker/price")
  u.searchParams.set("symbol", symbol)
  const res = await fetch(u.toString(), { cache: "no-store", signal: AbortSignal.timeout(10_000) })
  if (!res.ok) throw new Error(`Binance price HTTP ${res.status}`)
  const j = (await res.json()) as { price?: string }
  const p = parseFloat(j.price ?? "0")
  if (!Number.isFinite(p) || p <= 0) throw new Error("Invalid Binance price")
  return p
}

/**
 * POST /api/trade/execute
 * Header: x-nexus-real-trade-secret = NEXUS_REAL_TRADE_SECRET
 * Body: { symbol, action: "BUY"|"SELL", stopLoss, takeProfit, quoteSpendUsd? (BUY), baseQuantity? (SELL), riskPercent? }
 * Requires NEXUS_REAL_TRADING=1 and Binance keys on server.
 */
export async function POST(request: NextRequest) {
  const blocked = externalApisBlockedResponse()
  if (blocked) return blocked
  try {
    assertRealTradeApiSecret(request)
  } catch (e) {
    const status = (e as Error & { status?: number }).status ?? 500
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Auth error" },
      { status }
    )
  }

  if (process.env.NEXUS_REAL_TRADING !== "1") {
    return NextResponse.json(
      { ok: false, error: "Set NEXUS_REAL_TRADING=1 on the server to allow execution" },
      { status: 403 }
    )
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 })
  }

  const symbol = typeof body.symbol === "string" ? body.symbol.trim().toUpperCase() : ""
  const action = typeof body.action === "string" ? body.action.toUpperCase() : ""

  if (!symbol || (action !== "BUY" && action !== "SELL")) {
    return NextResponse.json({ ok: false, error: "symbol and action BUY|SELL required" }, { status: 400 })
  }

  const pair = symbol.endsWith("USDT") ? symbol : `${symbol}USDT`
  const governance = await requestGovernanceApproval({
    workerId: `api_trade_${Date.now()}`,
    lane: "api-trade-execute",
    userId: process.env.NEXUS_EXPERT_FALLBACK_USER_ID?.trim() || "api-trade-user",
    symbol: pair,
    action: action as "BUY" | "SELL",
    requestedQuoteUsd: action === "BUY" ? Number(body.quoteSpendUsd ?? 0) : undefined,
  })
  if (!governance.approved) {
    return NextResponse.json(
      { ok: false, error: `Governance denied (${governance.status})${governance.reason ? `: ${governance.reason}` : ""}` },
      { status: 409 }
    )
  }

  let entry: number
  try {
    entry = typeof body.entry === "number" ? body.entry : Number(body.entry)
    if (!Number.isFinite(entry) || entry <= 0) {
      entry = await fetchSpotPrice(pair)
    }
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Price fetch failed" },
      { status: 502 }
    )
  }

  const stopLossRaw = typeof body.stopLoss === "number" ? body.stopLoss : Number(body.stopLoss)
  const takeProfitRaw = typeof body.takeProfit === "number" ? body.takeProfit : Number(body.takeProfit)
  if (!Number.isFinite(stopLossRaw) || !Number.isFinite(takeProfitRaw)) {
    return NextResponse.json({ ok: false, error: "stopLoss and takeProfit must be numbers" }, { status: 400 })
  }

  // Accept either absolute prices (e.g. 2310.5) OR percent inputs (e.g. 2, 4).
  // Percent mode is assumed when both values are in a typical percent range.
  const looksLikePercent = stopLossRaw > 0 && stopLossRaw <= 50 && takeProfitRaw > 0 && takeProfitRaw <= 200
  const stopLoss =
    looksLikePercent && action === "BUY"
      ? entry * (1 - stopLossRaw / 100)
      : looksLikePercent && action === "SELL"
        ? entry * (1 + stopLossRaw / 100)
        : stopLossRaw
  const takeProfit =
    looksLikePercent && action === "BUY"
      ? entry * (1 + takeProfitRaw / 100)
      : looksLikePercent && action === "SELL"
        ? entry * (1 - takeProfitRaw / 100)
        : takeProfitRaw

  const riskPercent =
    typeof body.riskPercent === "number" && Number.isFinite(body.riskPercent)
      ? body.riskPercent
      : typeof body.riskPercent === "string"
        ? Number(body.riskPercent)
        : 2

  const spendOverride =
    action === "BUY" && body.quoteSpendUsd !== undefined ? Number(body.quoteSpendUsd) : undefined
  const baseOverride =
    action === "SELL" && body.baseQuantity !== undefined ? Number(body.baseQuantity) : undefined

  const signal: TradeSignal = {
    id: `api_${Date.now()}`,
    strategyId: "api_trade_execute",
    symbol: pair,
    action: action as TradeSignal["action"],
    confidence: 0.9,
    entry,
    stopLoss,
    takeProfit,
    riskPercent: Math.min(2, Math.max(0.5, riskPercent)),
    timestamp: new Date().toISOString(),
    reason: "POST /api/trade/execute",
    quoteOverrideUsd:
      spendOverride !== undefined && Number.isFinite(spendOverride) && spendOverride > 0
        ? spendOverride
        : undefined,
    baseOverrideQuantity:
      baseOverride !== undefined && Number.isFinite(baseOverride) && baseOverride > 0
        ? baseOverride
        : undefined,
  }

  try {
    const decided = await commanderDecide(signal, "live")
    if (decided.status !== "PENDING") {
      return NextResponse.json({ ok: false, order: decided, error: decided.rejectionReason }, { status: 400 })
    }

    const executed = await executeOrder(decided.id)
    // Avoid throwing while logging (e.g. non-serializable fields in dev).
    try {
      console.log(
        "[api/trade/execute]",
        JSON.stringify({ id: executed.id, status: executed.status, broker: executed.brokerOrderId })
      )
    } catch {
      console.log("[api/trade/execute]", executed.id, executed.status, executed.brokerOrderId)
    }

    return NextResponse.json({
      ok: executed.status === "FILLED",
      order: executed,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Trade execution failed"
    return NextResponse.json(
      {
        ok: false,
        error: msg,
        ...(process.env.NODE_ENV !== "production" && e instanceof Error ? { stack: e.stack } : {}),
      },
      { status: 500 }
    )
  }
}
