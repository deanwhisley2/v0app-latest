import { NextRequest, NextResponse } from "next/server"
import { requireExpertUserId } from "@/lib/expert/auth-server"
import { ERROR_CODES, errorResponse } from "@/lib/expert/execution-guards"
import { refreshExecutionPerformance } from "@/lib/execution-performance-engine"

export async function POST(req: NextRequest) {
  try {
    const userOrRes = await requireExpertUserId()
    if (userOrRes instanceof NextResponse) return userOrRes
    const userId = userOrRes
    const body = (await req.json().catch(() => ({}))) as { lookbackDays?: number }
    const result = await refreshExecutionPerformance({ userId, lookbackDays: body.lookbackDays })
    return NextResponse.json({ result })
  } catch (error) {
    return errorResponse(error, ERROR_CODES.INVALID_REQUEST, 500)
  }
}
