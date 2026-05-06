import { NextResponse } from "next/server"
import { requireExpertUserId } from "@/lib/expert/auth-server"
import { ERROR_CODES, errorResponse } from "@/lib/expert/execution-guards"
import { listSimulationRuns } from "@/lib/sandbox-execution-engine"

export async function GET(request: Request) {
  try {
    const userOrRes = await requireExpertUserId()
    if (userOrRes instanceof NextResponse) return userOrRes
    const { searchParams } = new URL(request.url)
    const limit = Number(searchParams.get("limit") ?? 30)
    const runs = await listSimulationRuns(userOrRes, limit)
    return NextResponse.json({ runs })
  } catch (error) {
    return errorResponse(error, ERROR_CODES.INVALID_REQUEST, 500)
  }
}
