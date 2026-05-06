import { NextRequest, NextResponse } from "next/server"
import { requireExpertUserId } from "@/lib/expert/auth-server"
import { ERROR_CODES, errorResponse } from "@/lib/expert/execution-guards"
import { listPluralisticSnapshots } from "@/lib/pluralistic-cognitive-governance"

export async function GET(request: NextRequest) {
  try {
    const userOrRes = await requireExpertUserId()
    if (userOrRes instanceof NextResponse) return userOrRes
    const limit = Number(request.nextUrl.searchParams.get("limit") ?? "25") || 25
    const rows = await listPluralisticSnapshots(userOrRes, limit)
    return NextResponse.json({ snapshots: rows })
  } catch (error) {
    return errorResponse(error, ERROR_CODES.INVALID_REQUEST, 500)
  }
}
