import { NextRequest, NextResponse } from "next/server"
import { requireExpertUserId } from "@/lib/expert/auth-server"
import {
  appendChatMessage,
  createSession,
  makeId,
  updateSession,
  upsertOrders,
} from "@/lib/expert/phase2-store"
import { validateExchange } from "@/lib/expert/exchange-precheck"
import { resolveBinanceCredentialsForExecution } from "@/lib/expert/user-binance"
import type { ManualTradeConfig, TradeOrder, TradeSession } from "@/lib/expert/phase2-types"
import {
  binanceMarketBuyQuote,
  waitOrderTerminal,
} from "@/lib/server/binance-signed-order"
import {
  assertBinanceCredentials,
  enforceAnalysisFreshness,
  enforceRealTradingEnvFlag,
  enforceSymbolConsistency,
  ERROR_CODES,
  errorResponse,
  mapErrorCode,
} from "@/lib/expert/execution-guards"

type RequestBody = {
  symbol?: string
  analysisId: string
  config: ManualTradeConfig
}

export async function POST(req: NextRequest) {
  const userOrRes = await requireExpertUserId()
  if (userOrRes instanceof NextResponse) return userOrRes
  const userId = userOrRes

  try {
    enforceRealTradingEnvFlag()
  } catch (error) {
    return errorResponse(error, ERROR_CODES.REAL_TRADING_DISABLED, 403)
  }

  let credsPack: Awaited<ReturnType<typeof resolveBinanceCredentialsForExecution>>
  try {
    credsPack = await resolveBinanceCredentialsForExecution(userId)
    assertBinanceCredentials(credsPack.creds)
  } catch (error) {
    return errorResponse(error, ERROR_CODES.MISSING_BINANCE_KEYS, 400)
  }
  const { creds } = credsPack

  let body: RequestBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ code: ERROR_CODES.INVALID_REQUEST, error: "Invalid JSON body" }, { status: 400 })
  }

  let analysis: Awaited<ReturnType<typeof enforceAnalysisFreshness>>
  try {
    analysis = await enforceAnalysisFreshness(body.analysisId, 60, { userId })
    enforceSymbolConsistency(analysis.symbol, body.symbol)
  } catch (error) {
    return errorResponse(error, ERROR_CODES.EXCHANGE_VALIDATION_FAILED, 400)
  }

  if (body.config.amountPerTrade < 1) {
    return NextResponse.json(
      { code: ERROR_CODES.MINIMUM_ORDER_NOT_MET, error: "MINIMUM_ORDER_NOT_MET: Minimum order is $1" },
      { status: 400 }
    )
  }
  try {
    await validateExchange(creds, analysis.symbol, body.config.amountPerTrade)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Exchange validation failed"
    return NextResponse.json({ code: mapErrorCode(message), error: message }, { status: 400 })
  }

  const sessionId = makeId("session")
  const repeatCount = Math.max(1, body.config.repeatCount)
  const session: TradeSession = {
    id: sessionId,
    userId,
    symbol: analysis.symbol,
    mode: "MANUAL",
    status: "ACTIVE",
    totalAmount: body.config.amountPerTrade * repeatCount,
    usedAmount: 0,
    startTime: new Date().toISOString(),
    config: body.config,
  }
  await createSession(session)

  const orderIds: string[] = []
  const orders: TradeOrder[] = []
  const { apiKey, apiSecret } = creds
  let failedReason: string | null = null
  for (let i = 0; i < repeatCount; i++) {
    try {
      const buy = await binanceMarketBuyQuote(analysis.symbol, body.config.amountPerTrade.toFixed(8), apiKey, apiSecret)
      const terminal = await waitOrderTerminal(analysis.symbol, buy.orderId, apiKey, apiSecret, 90_000)
      const executedQty = Number.parseFloat(terminal.executedQty || buy.executedQty || "0")
      const quote = Number.parseFloat(terminal.cummulativeQuoteQty || buy.cummulativeQuoteQty || "0")
      const avgPrice = executedQty > 0 ? quote / executedQty : body.config.buyPrice
      orderIds.push(String(buy.orderId))
      orders.push({
        id: makeId("row"),
        sessionId,
        userId,
        symbol: analysis.symbol,
        orderId: String(buy.orderId),
        type: "BUY",
        price: avgPrice,
        quantity: executedQty,
        quoteAmount: quote || body.config.amountPerTrade,
        status: terminal.status === "FILLED" ? "FILLED" : "FAILED",
        createdAt: new Date().toISOString(),
        filledAt: terminal.status === "FILLED" ? new Date().toISOString() : undefined,
      })
      await appendChatMessage(sessionId, {
        type: "order",
        content: `BUY ${analysis.symbol} filled: ${executedQty.toFixed(6)} @ ${avgPrice.toFixed(6)} (order ${buy.orderId})`,
      })
    } catch (error) {
      await appendChatMessage(sessionId, {
        type: "error",
        content: `Order failed: ${error instanceof Error ? error.message : "Unknown Binance error"}`,
      })
      failedReason = error instanceof Error ? error.message : "Unknown Binance error"
      session.status = "ABORTED"
      session.endTime = new Date().toISOString()
      break
    }
  }

  session.usedAmount = orders.reduce((acc, o) => acc + o.quoteAmount, 0)
  if (session.status !== "ABORTED") {
    session.status = "COMPLETED"
    session.endTime = new Date().toISOString()
  }

  await upsertOrders(sessionId, orders)
  await updateSession(sessionId, {
    status: session.status,
    usedAmount: session.usedAmount,
    endTime: session.endTime,
  })
  await appendChatMessage(sessionId, {
    type: "status",
    content:
      session.status === "COMPLETED" ? "Manual session completed with real exchange fills." : "Manual session aborted due to order failure.",
  })

  if (failedReason) {
    return NextResponse.json(
      { code: ERROR_CODES.ORDER_FAILED, error: `ORDER_FAILED: ${failedReason}`, sessionId, orderIds },
      { status: 502 }
    )
  }

  return NextResponse.json({
    sessionId,
    status: session.status === "COMPLETED" ? "completed" : "aborted",
    orderIds,
  })
}
