import { NextRequest, NextResponse } from "next/server"
import { requireExpertUserId } from "@/lib/expert/auth-server"
import { ERROR_CODES, errorResponse } from "@/lib/expert/execution-guards"
import { listPluralisticEvents } from "@/lib/pluralistic-cognitive-governance"

export async function GET(request: NextRequest) {
  try {
    const userOrRes = await requireExpertUserId()
    if (userOrRes instanceof NextResponse) return userOrRes
    const limit = Number(request.nextUrl.searchParams.get("limit") ?? "50") || 50
    const rows = await listPluralisticEvents(userOrRes, limit)
    return NextResponse.json({ events: rows })
  } catch (error) {
    return errorResponse(error, ERROR_CODES.INVALID_REQUEST, 500)
  }
}
