import { NextRequest, NextResponse } from "next/server"
import {
  appendChatMessage,
  createSession,
  getAnalysisById,
  getUserId,
  makeId,
  upsertOrders,
} from "@/lib/expert/phase2-store"
import { validateExchange } from "@/lib/expert/exchange-precheck"
import type { ManualTradeConfig, TradeOrder, TradeSession } from "@/lib/expert/phase2-types"

type RequestBody = {
  analysisId: string
  config: ManualTradeConfig
}

export async function POST(req: NextRequest) {
  let body: RequestBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const analysis = await getAnalysisById(body.analysisId)
  if (!analysis) return NextResponse.json({ error: "analysisId not found" }, { status: 404 })
  if (body.config.amountPerTrade < 1) {
    return NextResponse.json({ error: "Minimum order is $1" }, { status: 400 })
  }
  try {
    await validateExchange(getUserId(), analysis.symbol, body.config.amountPerTrade)
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Exchange validation failed" }, { status: 400 })
  }

  const sessionId = makeId("session")
  const session: TradeSession = {
    id: sessionId,
    userId: getUserId(),
    symbol: analysis.symbol,
    mode: "MANUAL",
    status: "ACTIVE",
    totalAmount: body.config.amountPerTrade * Math.max(1, body.config.repeatCount),
    usedAmount: body.config.amountPerTrade,
    startTime: new Date().toISOString(),
    config: body.config,
  }
  await createSession(session)

  const orderIds: string[] = []
  const orders: TradeOrder[] = []
  for (let i = 0; i < Math.max(1, body.config.repeatCount); i++) {
    const orderId = makeId("order")
    orderIds.push(orderId)
    orders.push({
      id: makeId("row"),
      sessionId,
      userId: getUserId(),
      symbol: analysis.symbol,
      orderId,
      type: "BUY",
      price: body.config.buyPrice,
      quantity: body.config.amountPerTrade / Math.max(body.config.buyPrice, 0.0000001),
      quoteAmount: body.config.amountPerTrade,
      status: "PENDING",
      createdAt: new Date().toISOString(),
    })
  }
  await upsertOrders(sessionId, orders)
  await appendChatMessage(sessionId, { type: "status", content: "Manual session started" })
  await appendChatMessage(sessionId, { type: "pending", content: "BOT PENDING - Verifying safety measures" })

  return NextResponse.json({
    sessionId,
    status: "started",
    orderIds,
  })
}
