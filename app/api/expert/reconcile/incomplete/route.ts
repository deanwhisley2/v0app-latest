import { NextRequest, NextResponse } from "next/server"
import { requireExpertUserId } from "@/lib/expert/auth-server"
import { ERROR_CODES, errorResponse } from "@/lib/expert/execution-guards"
import { reconcileIncompleteSessions } from "@/lib/exchange-reconciliation"

export async function POST(req: NextRequest) {
  try {
    const userOrRes = await requireExpertUserId()
    if (userOrRes instanceof NextResponse) return userOrRes
    const userId = userOrRes
    const body = (await req.json().catch(() => ({}))) as { maxAgeMinutes?: number; autoRepair?: boolean }
    const result = await reconcileIncompleteSessions({
      userId,
      maxAgeMinutes: body.maxAgeMinutes,
      autoRepair: body.autoRepair === true,
    })
    return NextResponse.json({ recovered: result.length, result })
  } catch (error) {
    return errorResponse(error, ERROR_CODES.INVALID_REQUEST, 500)
  }
}
