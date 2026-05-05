import { NextRequest, NextResponse } from "next/server"
import { requireExpertUserId } from "@/lib/expert/auth-server"
import { ERROR_CODES } from "@/lib/expert/execution-guards"
import { getOrdersBySession, getSessionById, getSessionSummary } from "@/lib/expert/phase2-store"

export async function GET(_req: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  const userOrRes = await requireExpertUserId()
  if (userOrRes instanceof NextResponse) return userOrRes
  const userId = userOrRes

  const { sessionId } = await params
  const session = await getSessionById(sessionId)
  if (!session) return NextResponse.json({ error: "session not found" }, { status: 404 })
  if (session.userId !== userId) {
    return NextResponse.json(
      { code: ERROR_CODES.FORBIDDEN_SESSION, error: "FORBIDDEN_SESSION" },
      { status: 403 }
    )
  }
  const all = await getOrdersBySession(sessionId)
  const activeOrders = all.filter((o) => o.status === "PENDING")
  const history = all.filter((o) => o.status !== "PENDING")
  const summary = await getSessionSummary(sessionId)

  return NextResponse.json({
    sessionId,
    status: session.status,
    usedAmount: session.usedAmount,
    remainingAmount: Math.max(0, session.totalAmount - session.usedAmount),
    activeOrders,
    history,
    pnl: summary.currentPnl,
  })
}
