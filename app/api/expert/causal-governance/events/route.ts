import { NextRequest, NextResponse } from "next/server"
import { requireExpertUserId } from "@/lib/expert/auth-server"
import { ERROR_CODES, errorResponse } from "@/lib/expert/execution-guards"
import { listCausalGovernanceEvents } from "@/lib/causal-governance-assessment"

export async function GET(request: NextRequest) {
  try {
    const userOrRes = await requireExpertUserId()
    if (userOrRes instanceof NextResponse) return userOrRes
    const limit = Number(request.nextUrl.searchParams.get("limit") ?? "80") || 80
    const rows = await listCausalGovernanceEvents(userOrRes, limit)
    return NextResponse.json({ events: rows })
  } catch (error) {
    return errorResponse(error, ERROR_CODES.INVALID_REQUEST, 500)
  }
}
