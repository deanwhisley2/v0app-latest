import { NextRequest, NextResponse } from "next/server"
import {
  appendChatMessage,
  createSession,
  getUserId,
  makeId,
  upsertOrders,
  updateSession,
} from "@/lib/expert/phase2-store"
import { validateExchange } from "@/lib/expert/exchange-precheck"
import type { AutoTradeConfig, TradeOrder, TradeSession } from "@/lib/expert/phase2-types"
import {
  binanceMarketBuyQuote,
  waitOrderTerminal,
} from "@/lib/server/binance-signed-order"
import {
  enforceAnalysisFreshness,
  enforceRealTradingGuard,
  enforceSymbolConsistency,
  ERROR_CODES,
  errorResponse,
  mapErrorCode,
} from "@/lib/expert/execution-guards"

type RequestBody = {
  symbol?: string
  analysisId: string
  config: AutoTradeConfig
}

export async function POST(req: NextRequest) {
  try {
    enforceRealTradingGuard()
  } catch (error) {
    return errorResponse(error, ERROR_CODES.REAL_TRADING_DISABLED, 403)
  }

  let body: RequestBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ code: ERROR_CODES.INVALID_REQUEST, error: "Invalid JSON body" }, { status: 400 })
  }
  let analysis: Awaited<ReturnType<typeof enforceAnalysisFreshness>>
  try {
    analysis = await enforceAnalysisFreshness(body.analysisId, 60)
    enforceSymbolConsistency(analysis.symbol, body.symbol)
  } catch (error) {
    return errorResponse(error, ERROR_CODES.EXCHANGE_VALIDATION_FAILED, 400)
  }
  if (body.config.totalAmount < 1) {
    return NextResponse.json(
      { code: ERROR_CODES.MINIMUM_ORDER_NOT_MET, error: "MINIMUM_ORDER_NOT_MET: Minimum order is $1" },
      { status: 400 }
    )
  }

  try {
    await validateExchange(getUserId(), analysis.symbol, body.config.totalAmount)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Exchange validation failed"
    return NextResponse.json({ code: mapErrorCode(message), error: message }, { status: 400 })
  }

  const sessionId = makeId("session")
  const executeAt = new Date(Date.now() + Math.max(0, body.config.entryDelayMinutes) * 60_000)
  const session: TradeSession = {
    id: sessionId,
    userId: getUserId(),
    symbol: analysis.symbol,
    mode: "NEX",
    status: "PENDING",
    totalAmount: body.config.totalAmount,
    usedAmount: 0,
    startTime: new Date().toISOString(),
    config: body.config,
  }
  await createSession(session)
  await appendChatMessage(sessionId, {
    type: "pending",
    content:
      body.config.entryDelayMinutes > 0
        ? `NEX delay configured (${body.config.entryDelayMinutes}m). Executing immediate safety-checked entry now.`
        : "NEX executing immediate safety-checked entry.",
  })

  const orders: TradeOrder[] = []
  const apiKey = process.env.BINANCE_API_KEY!.trim()
  const apiSecret = (process.env.BINANCE_SECRET_KEY || process.env.BINANCE_API_SECRET || "").trim()
  let failedReason: string | null = null
  try {
    const buy = await binanceMarketBuyQuote(analysis.symbol, body.config.totalAmount.toFixed(8), apiKey, apiSecret)
    const terminal = await waitOrderTerminal(analysis.symbol, buy.orderId, apiKey, apiSecret, 90_000)
    const executedQty = Number.parseFloat(terminal.executedQty || buy.executedQty || "0")
    const quote = Number.parseFloat(terminal.cummulativeQuoteQty || buy.cummulativeQuoteQty || "0")
    const avgPrice = executedQty > 0 ? quote / executedQty : 0
    orders.push({
      id: makeId("row"),
      sessionId,
      userId: getUserId(),
      symbol: analysis.symbol,
      orderId: String(buy.orderId),
      type: "BUY",
      price: avgPrice,
      quantity: executedQty,
      quoteAmount: quote || body.config.totalAmount,
      status: terminal.status === "FILLED" ? "FILLED" : "FAILED",
      createdAt: new Date().toISOString(),
      filledAt: terminal.status === "FILLED" ? new Date().toISOString() : undefined,
    })
    session.usedAmount = quote || body.config.totalAmount
    session.status = terminal.status === "FILLED" ? "ACTIVE" : "ABORTED"
    if (session.status === "ABORTED") {
      session.endTime = new Date().toISOString()
    }
    await appendChatMessage(sessionId, {
      type: "order",
      content: `NEX BUY ${analysis.symbol}: ${executedQty.toFixed(6)} @ ${avgPrice.toFixed(6)} (order ${buy.orderId})`,
    })
  } catch (error) {
    session.status = "ABORTED"
    session.endTime = new Date().toISOString()
    failedReason = error instanceof Error ? error.message : "Unknown Binance error"
    await appendChatMessage(sessionId, {
      type: "error",
      content: `NEX entry failed: ${failedReason}`,
    })
  }

  if (orders.length > 0) await upsertOrders(sessionId, orders)
  await updateSession(sessionId, { status: session.status, usedAmount: session.usedAmount, endTime: session.endTime })

  if (failedReason) {
    return NextResponse.json(
      { code: ERROR_CODES.ORDER_FAILED, error: `ORDER_FAILED: ${failedReason}`, sessionId },
      { status: 502 }
    )
  }

  return NextResponse.json({
    sessionId,
    status: session.status === "ABORTED" ? "aborted" : "started",
    executeAt: executeAt.toISOString(),
  })
}
