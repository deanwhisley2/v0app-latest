import { NextResponse } from "next/server"
import { requireExpertUserId } from "@/lib/expert/auth-server"
import { ERROR_CODES, errorResponse } from "@/lib/expert/execution-guards"
import { refreshStabilityIntelligence } from "@/lib/stability-intelligence-engine"

export async function POST() {
  try {
    const userOrRes = await requireExpertUserId()
    if (userOrRes instanceof NextResponse) return userOrRes
    const result = await refreshStabilityIntelligence({ userId: userOrRes, force: true, minRefreshMs: 0 })
    return NextResponse.json({ result })
  } catch (error) {
    return errorResponse(error, ERROR_CODES.INVALID_REQUEST, 500)
  }
}
