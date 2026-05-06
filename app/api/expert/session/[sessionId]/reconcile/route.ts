import { NextRequest, NextResponse } from "next/server"
import { requireExpertUserId } from "@/lib/expert/auth-server"
import { ERROR_CODES, errorResponse } from "@/lib/expert/execution-guards"
import { reconcileSessionWithExchange } from "@/lib/exchange-reconciliation"

export async function POST(req: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  try {
    const userOrRes = await requireExpertUserId()
    if (userOrRes instanceof NextResponse) return userOrRes
    const userId = userOrRes
    const { sessionId } = await params
    const body = (await req.json().catch(() => ({}))) as { autoRepair?: boolean }
    const result = await reconcileSessionWithExchange({
      sessionId,
      userId,
      autoRepair: body.autoRepair === true,
    })
    return NextResponse.json({ result })
  } catch (error) {
    return errorResponse(error, ERROR_CODES.INVALID_REQUEST, 500)
  }
}
