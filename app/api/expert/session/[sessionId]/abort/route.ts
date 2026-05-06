import { NextRequest, NextResponse } from "next/server"
import { requireExpertUserId } from "@/lib/expert/auth-server"
import {
  appendChatMessage,
  getAnalysisById,
  getOrdersBySession,
  getSessionById,
  updateSession,
  upsertOrders,
} from "@/lib/expert/phase2-store"
import { binanceMarketSellBase, waitOrderTerminal } from "@/lib/server/binance-signed-order"
import {
  assertBinanceCredentials,
  enforceRealTradingEnvFlag,
  ERROR_CODES,
  errorResponse,
} from "@/lib/expert/execution-guards"
import { resolveBinanceCredentialsForExecution } from "@/lib/expert/user-binance"
import { regimeBucketForTradeMemory } from "@/lib/market-state-authority"
import type { MarketRegime } from "@/lib/trade-memory"
import {
  acquireExecutionLock,
  commitLiquidationLifecycleTransaction,
  beginIdempotentEvent,
  completeIdempotentEvent,
  releaseExecutionLock,
  upsertExecutionState,
  upsertPositionState,
} from "@/lib/runtime-state-authority"
import { refreshExecutionPerformance } from "@/lib/execution-performance-engine"

export async function POST(req: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  const userOrRes = await requireExpertUserId()
  if (userOrRes instanceof NextResponse) return userOrRes
  const userId = userOrRes

  const { sessionId } = await params
  const session = await getSessionById(sessionId)
  if (!session) return NextResponse.json({ code: ERROR_CODES.INVALID_REQUEST, error: "session not found" }, { status: 404 })
  if (session.userId !== userId) {
    return NextResponse.json(
      { code: ERROR_CODES.FORBIDDEN_SESSION, error: "FORBIDDEN_SESSION: This session belongs to another account." },
      { status: 403 }
    )
  }

  const body = (await req.json().catch(() => ({}))) as { force?: boolean }
  const force = body.force === true

  if (!force) {
    await updateSession(sessionId, { status: "ABORTED" })
    await upsertExecutionState({
      sessionId,
      userId,
      symbol: session.symbol,
      status: "STOP_BUYS",
    })
    await appendChatMessage(sessionId, { type: "status", content: "Abort requested: no new buys, managing exits." })
    return NextResponse.json({ status: "STOPPED_BUYING" })
  }
  const lockOwner = `abort_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const lockKey = `liquidation:${userId}:${sessionId}`
  const lock = await acquireExecutionLock({
    lockKey,
    ownerId: lockOwner,
    ttlMs: 180_000,
    userId,
    symbol: session.symbol,
    sessionId,
  })
  if (!lock.acquired) {
    return NextResponse.json(
      { code: ERROR_CODES.LIQUIDATION_FAILED, error: "LIQUIDATION_FAILED: liquidation already in progress." },
      { status: 409 }
    )
  }
  const idemKey = `force-abort:${sessionId}`
  const idem = await beginIdempotentEvent({
    eventKey: idemKey,
    userId,
    symbol: session.symbol,
    sessionId,
  })
  if (!idem.ok) {
    await releaseExecutionLock({ lockKey, ownerId: lockOwner, userId, symbol: session.symbol, sessionId })
    return NextResponse.json(
      {
        code: ERROR_CODES.INVALID_REQUEST,
        error: `DUPLICATE_ABORT_EVENT: ${idem.existingStatus ?? "existing"}`,
      },
      { status: 409 }
    )
  }

  try {
    try {
      enforceRealTradingEnvFlag()
    } catch (error) {
      return errorResponse(error, ERROR_CODES.REAL_TRADING_DISABLED, 403)
    }

    let creds: { apiKey: string; apiSecret: string }
    try {
      const resolved = await resolveBinanceCredentialsForExecution(userId)
      assertBinanceCredentials(resolved.creds)
      creds = resolved.creds
    } catch (error) {
      return errorResponse(error, ERROR_CODES.MISSING_BINANCE_KEYS, 400)
    }

    let orderList = await getOrdersBySession(sessionId)
    const boughtQty = orderList.filter((o) => o.type === "BUY" && o.status === "FILLED").reduce((acc, o) => acc + o.quantity, 0)
    const soldQty = orderList.filter((o) => o.type === "SELL" && o.status === "FILLED").reduce((acc, o) => acc + o.quantity, 0)
    const qtyToSell = Math.max(0, boughtQty - soldQty)
    if (qtyToSell <= 0) {
    await updateSession(sessionId, { status: "COMPLETED", endTime: new Date().toISOString() })
    await upsertExecutionState({
      sessionId,
      userId,
      symbol: session.symbol,
      status: "COMPLETED",
    })
    await upsertPositionState({
      userId,
      symbol: session.symbol,
      sessionId,
      status: "FLAT",
      quantity: 0,
      entryPrice: null,
    })
    await appendChatMessage(sessionId, { type: "status", content: "Force abort requested but no open position remained." })
      return NextResponse.json({ status: "LIQUIDATING", liquidationValue: 0, closed: false })
    }

    let liquidationValue = 0
    const now = new Date().toISOString()
    let sell
    let terminal
    try {
    sell = await binanceMarketSellBase(session.symbol, qtyToSell.toFixed(8), creds.apiKey, creds.apiSecret)
    terminal = await waitOrderTerminal(session.symbol, sell.orderId, creds.apiKey, creds.apiSecret, 90_000)
    } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown liquidation error"
    await appendChatMessage(sessionId, { type: "error", content: `Liquidation failed: ${message}` })
      return NextResponse.json({ code: ERROR_CODES.LIQUIDATION_FAILED, error: `LIQUIDATION_FAILED: ${message}` }, { status: 502 })
    }
    const executedQty = Number.parseFloat(terminal.executedQty || sell.executedQty || "0")
  liquidationValue = Number.parseFloat(terminal.cummulativeQuoteQty || sell.cummulativeQuoteQty || "0")
  const liquidationOrder = {
    id: `row_abort_${sell.orderId}`,
    sessionId,
    userId: session.userId,
    symbol: session.symbol,
    orderId: String(sell.orderId),
    type: "SELL" as const,
    price: executedQty > 0 ? liquidationValue / executedQty : 0,
    quantity: executedQty,
    quoteAmount: liquidationValue,
    status: terminal.status === "FILLED" ? ("FILLED" as const) : ("FAILED" as const),
    createdAt: now,
    filledAt: terminal.status === "FILLED" ? now : undefined,
  }
    const tradeMemoryPayload: Record<string, unknown> | null = terminal.status === "FILLED"
      ? {
          symbol: session.symbol,
          marketRegime: "UNKNOWN",
          decision: "BUY",
          rawConfidence: null,
          calibratedConfidence: null,
          kalmanScore: null,
          liquidityScore: null,
          sentimentScore: null,
          raceScore: null,
          entryPrice: null,
          exitPrice: executedQty > 0 ? liquidationValue / executedQty : null,
          quantity: executedQty,
          pnlUsd: null,
          holdDurationMs: null,
          wasWin: null,
          cooldownActive: false,
          notes: "Lifecycle close pending enrichment.",
          analysisId: null,
          sessionId,
        }
      : null
    await appendChatMessage(sessionId, { type: "status", content: "Force abort: liquidation in progress/completed." })

    let realizedPnlUsd: number | null = null
    if (terminal.status === "FILLED") {
      orderList = await getOrdersBySession(sessionId)
      const filledBuys = orderList.filter((o) => o.type === "BUY" && o.status === "FILLED")
      const totalBuyQty = filledBuys.reduce((acc, o) => acc + o.quantity, 0)
      const totalBuyCost = filledBuys.reduce((acc, o) => acc + o.quoteAmount, 0)
      realizedPnlUsd = liquidationValue - totalBuyCost
      const entryPrice = totalBuyQty > 0 ? totalBuyCost / totalBuyQty : null
      const exitPrice = executedQty > 0 ? liquidationValue / executedQty : null
      const firstBuyFillMs = filledBuys
        .map((o) => new Date(o.filledAt ?? o.createdAt).getTime())
        .filter((ms) => Number.isFinite(ms))
        .sort((a, b) => a - b)[0]
      const sellFillMs = new Date(liquidationOrder.filledAt ?? liquidationOrder.createdAt).getTime()
      const holdDurationMs =
        Number.isFinite(firstBuyFillMs) && Number.isFinite(sellFillMs)
          ? Math.max(0, sellFillMs - firstBuyFillMs)
          : null

      const cfg = (session.config ?? {}) as Record<string, unknown>
      const analysisId = typeof cfg.analysisId === "string" ? cfg.analysisId : null
      const analysis = analysisId ? await getAnalysisById(analysisId) : null
      const rawConfidence =
        typeof cfg.rawConfidence === "number"
          ? cfg.rawConfidence
          : analysis?.rawConfidence ?? analysis?.confidence ?? null
      const calibratedConfidence =
        typeof cfg.calibratedConfidence === "number"
          ? cfg.calibratedConfidence
          : analysis?.calibratedConfidence ?? rawConfidence
      const cfgMarketRegime = typeof cfg.marketRegime === "string" ? cfg.marketRegime : "UNKNOWN"
      const marketRegime: MarketRegime = regimeBucketForTradeMemory(cfgMarketRegime)
      Object.assign(tradeMemoryPayload ?? {}, {
        symbol: session.symbol,
        marketRegime,
        decision: analysis?.action === "BUY" || analysis?.action === "SELL" ? analysis.action : "BUY",
        rawConfidence,
        calibratedConfidence,
        kalmanScore: null,
        liquidityScore: null,
        sentimentScore: null,
        raceScore: null,
        entryPrice,
        exitPrice,
        quantity: executedQty,
        pnlUsd: realizedPnlUsd,
        holdDurationMs,
        wasWin: realizedPnlUsd > 0,
        cooldownActive: false,
        notes: "Recorded after completed BUY->SELL lifecycle during forced liquidation.",
        analysisId,
        sessionId,
      })
    }
    await commitLiquidationLifecycleTransaction({
      sessionId,
      userId,
      symbol: session.symbol,
      sellOrder: liquidationOrder as unknown as Record<string, unknown>,
      sessionStatus: "COMPLETED",
      endTime: now,
      executionStatus: terminal.status === "FILLED" ? "COMPLETED" : "FAILED",
      executionLastError: terminal.status === "FILLED" ? null : `Liquidation ended ${terminal.status}`,
      markFlat: terminal.status === "FILLED",
      lastExecutionAt: now,
      pnlUsd: terminal.status === "FILLED" ? realizedPnlUsd : null,
      tradeMemory: terminal.status === "FILLED" ? tradeMemoryPayload : null,
    })
    if (terminal.status === "FILLED" && tradeMemoryPayload) {
      console.log(
        `[trade-memory] stored symbol=${session.symbol} decision=${String(tradeMemoryPayload.decision)} pnlUsd=${String(tradeMemoryPayload.pnlUsd)} marketRegime=${String(tradeMemoryPayload.marketRegime)} confidence=${String(tradeMemoryPayload.rawConfidence ?? "null")}`
      )
      try {
        await refreshExecutionPerformance({ userId, lookbackDays: 14 })
      } catch (perfErr) {
        console.warn(
          `[performance-drift] refresh-failed sessionId=${sessionId} error=${perfErr instanceof Error ? perfErr.message : String(perfErr)}`
        )
      }
    }

    const saleAvg = executedQty > 0 ? liquidationValue / executedQty : 0
    const response = {
      status: "LIQUIDATING",
      liquidationValue,
      closed: terminal.status === "FILLED",
      fill: {
        side: "SELL" as const,
        avgPrice: saleAvg,
        quantity: executedQty,
        proceeds: liquidationValue,
      },
    }
    await completeIdempotentEvent({ eventKey: idemKey, status: "COMPLETED", response })
    return NextResponse.json(response)
  } catch (error) {
    await completeIdempotentEvent({
      eventKey: idemKey,
      status: "FAILED",
      response: { error: error instanceof Error ? error.message : "Unknown error" },
    })
    throw error
  } finally {
    await releaseExecutionLock({
      lockKey,
      ownerId: lockOwner,
      userId,
      symbol: session.symbol,
      sessionId,
    })
  }
}
