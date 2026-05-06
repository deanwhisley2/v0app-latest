import { NextResponse } from "next/server"
import { requireExpertUserId } from "@/lib/expert/auth-server"
import { ERROR_CODES, errorResponse } from "@/lib/expert/execution-guards"
import { listMetaGovernanceSnapshots } from "@/lib/meta-evolution-supervisor"

export async function GET(request: Request) {
  try {
    const userOrRes = await requireExpertUserId()
    if (userOrRes instanceof NextResponse) return userOrRes
    const { searchParams } = new URL(request.url)
    const limit = Number(searchParams.get("limit") ?? 25)
    const snapshots = await listMetaGovernanceSnapshots(userOrRes, limit)
    return NextResponse.json({ snapshots })
  } catch (error) {
    return errorResponse(error, ERROR_CODES.INVALID_REQUEST, 500)
  }
}
