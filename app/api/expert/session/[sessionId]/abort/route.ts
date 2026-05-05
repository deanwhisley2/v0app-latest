import { NextRequest, NextResponse } from "next/server"
import { appendChatMessage, getOrdersBySession, getSessionById, phase2Store, upsertOrders } from "@/lib/expert/phase2-store"

export async function POST(req: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params
  const session = await getSessionById(sessionId)
  if (!session) return NextResponse.json({ error: "session not found" }, { status: 404 })
  const body = (await req.json().catch(() => ({}))) as { force?: boolean }
  const force = body.force === true

  if (!force) {
    session.status = "ABORTED"
    await appendChatMessage(sessionId, { type: "status", content: "Abort requested: no new buys, managing exits." })
    return NextResponse.json({ status: "STOPPED_BUYING" })
  }

  const orders = await getOrdersBySession(sessionId)
  let liquidationValue = 0
  const now = new Date().toISOString()
  for (const order of orders) {
    if (order.status === "PENDING") {
      order.status = "FILLED"
      order.filledAt = now
      liquidationValue += order.quoteAmount
    }
  }
  await upsertOrders(sessionId, orders)
  session.status = "COMPLETED"
  session.endTime = now
  phase2Store.sessions.set(sessionId, session)
  await appendChatMessage(sessionId, { type: "status", content: "Force abort: liquidation in progress/completed." })
  return NextResponse.json({ status: "LIQUIDATING", liquidationValue })
}
