import { NextResponse } from "next/server"
import { requireExpertUserId } from "@/lib/expert/auth-server"
import { listTradeSessionsForUser } from "@/lib/expert/phase2-store"
import { ERROR_CODES, errorResponse } from "@/lib/expert/execution-guards"

/** Lists trade sessions for the signed-in user (cross-device via Supabase). */
export async function GET() {
  try {
    const userOrRes = await requireExpertUserId()
    if (userOrRes instanceof NextResponse) return userOrRes
    const sessions = await listTradeSessionsForUser(userOrRes, 50)
    return NextResponse.json({ sessions })
  } catch (error) {
    return errorResponse(error, ERROR_CODES.INVALID_REQUEST, 500)
  }
}
