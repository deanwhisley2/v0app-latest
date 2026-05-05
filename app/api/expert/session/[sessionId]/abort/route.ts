import { NextRequest, NextResponse } from "next/server"
import { requireExpertUserId } from "@/lib/expert/auth-server"
import {
  appendChatMessage,
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
    await appendChatMessage(sessionId, { type: "status", content: "Abort requested: no new buys, managing exits." })
    return NextResponse.json({ status: "STOPPED_BUYING" })
  }

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
  orderList = [
    ...orderList,
    {
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
    },
  ]
  await upsertOrders(sessionId, orderList)
  await updateSession(sessionId, { status: "COMPLETED", endTime: now })
  await appendChatMessage(sessionId, { type: "status", content: "Force abort: liquidation in progress/completed." })
  return NextResponse.json({ status: "LIQUIDATING", liquidationValue })
}
