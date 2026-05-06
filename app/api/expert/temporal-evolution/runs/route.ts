import { NextResponse } from "next/server"
import { requireExpertUserId } from "@/lib/expert/auth-server"
import { ERROR_CODES, errorResponse } from "@/lib/expert/execution-guards"
import { listTemporalEvolutionRuns } from "@/lib/temporal-evolution-engine"

export async function GET(request: Request) {
  try {
    const userOrRes = await requireExpertUserId()
    if (userOrRes instanceof NextResponse) return userOrRes
    const { searchParams } = new URL(request.url)
    const limit = Number(searchParams.get("limit") ?? 25)
    const runs = await listTemporalEvolutionRuns(userOrRes, limit)
    return NextResponse.json({ runs })
  } catch (error) {
    return errorResponse(error, ERROR_CODES.INVALID_REQUEST, 500)
  }
}
