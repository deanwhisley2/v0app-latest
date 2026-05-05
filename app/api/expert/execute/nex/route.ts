import { NextRequest, NextResponse } from "next/server"
import {
  appendChatMessage,
  createSession,
  getAnalysisById,
  getUserId,
  makeId,
} from "@/lib/expert/phase2-store"
import { validateExchange } from "@/lib/expert/exchange-precheck"
import type { AutoTradeConfig, TradeSession } from "@/lib/expert/phase2-types"

type RequestBody = {
  analysisId: string
  config: AutoTradeConfig
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
  if (body.config.totalAmount < 1) return NextResponse.json({ error: "Minimum order is $1" }, { status: 400 })

  try {
    await validateExchange(getUserId(), analysis.symbol, body.config.totalAmount)
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Exchange validation failed" }, { status: 400 })
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
  await appendChatMessage(sessionId, { type: "pending", content: "BOT PENDING - Verifying safety measures" })

  return NextResponse.json({
    sessionId,
    status: "scheduled",
    executeAt: executeAt.toISOString(),
  })
}
