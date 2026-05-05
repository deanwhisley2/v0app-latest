import { NextRequest, NextResponse } from "next/server"
import {
  appendChatMessage,
  getOrdersBySession,
  getSessionById,
  updateSession,
  upsertOrders,
} from "@/lib/expert/phase2-store"
import { binanceMarketSellBase, getBinanceCredentialsFromEnv, waitOrderTerminal } from "@/lib/server/binance-signed-order"
import { enforceRealTradingGuard, ERROR_CODES, errorResponse } from "@/lib/expert/execution-guards"

export async function POST(req: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  try {
    enforceRealTradingGuard()
  } catch (error) {
    return errorResponse(error, ERROR_CODES.REAL_TRADING_DISABLED, 403)
  }
  const { sessionId } = await params
  const session = await getSessionById(sessionId)
  if (!session) return NextResponse.json({ code: ERROR_CODES.INVALID_REQUEST, error: "session not found" }, { status: 404 })
  const body = (await req.json().catch(() => ({}))) as { force?: boolean }
  const force = body.force === true

  if (!force) {
    await updateSession(sessionId, { status: "ABORTED" })
    await appendChatMessage(sessionId, { type: "status", content: "Abort requested: no new buys, managing exits." })
    return NextResponse.json({ status: "STOPPED_BUYING" })
  }

  const orders = await getOrdersBySession(sessionId)
  const creds = getBinanceCredentialsFromEnv()
  if (!creds) {
    return NextResponse.json(
      { code: ERROR_CODES.MISSING_BINANCE_KEYS, error: "MISSING_BINANCE_KEYS: Configure BINANCE_API_KEY and BINANCE_SECRET_KEY" },
      { status: 500 }
    )
  }
  const boughtQty = orders.filter((o) => o.type === "BUY" && o.status === "FILLED").reduce((acc, o) => acc + o.quantity, 0)
  const soldQty = orders.filter((o) => o.type === "SELL" && o.status === "FILLED").reduce((acc, o) => acc + o.quantity, 0)
  const qtyToSell = Math.max(0, boughtQty - soldQty)
  if (qtyToSell <= 0) {
    await updateSession(sessionId, { status: "COMPLETED", endTime: new Date().toISOString() })
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
  orders.push({
    id: `row_abort_${sell.orderId}`,
    sessionId,
    userId: session.userId,
    symbol: session.symbol,
    orderId: String(sell.orderId),
    type: "SELL",
    price: executedQty > 0 ? liquidationValue / executedQty : 0,
    quantity: executedQty,
    quoteAmount: liquidationValue,
    status: terminal.status === "FILLED" ? "FILLED" : "FAILED",
    createdAt: now,
    filledAt: terminal.status === "FILLED" ? now : undefined,
  })
  await upsertOrders(sessionId, orders)
  await updateSession(sessionId, { status: "COMPLETED", endTime: now })
  await appendChatMessage(sessionId, { type: "status", content: "Force abort: liquidation in progress/completed." })
  return NextResponse.json({ status: "LIQUIDATING", liquidationValue })
}
