import { NextResponse } from "next/server"
import { requireExpertUserId } from "@/lib/expert/auth-server"
import { ERROR_CODES, errorResponse } from "@/lib/expert/execution-guards"
import { SINGLE_WORLD_LIMITATION_INVENTORY } from "@/lib/single-world-simulation-limitations"

export async function GET() {
  try {
    const userOrRes = await requireExpertUserId()
    if (userOrRes instanceof NextResponse) return userOrRes
    return NextResponse.json({ limitations: SINGLE_WORLD_LIMITATION_INVENTORY })
  } catch (error) {
    return errorResponse(error, ERROR_CODES.INVALID_REQUEST, 500)
  }
}
