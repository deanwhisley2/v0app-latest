import { NextResponse } from "next/server"
import { requireExpertUserId } from "@/lib/expert/auth-server"
import { ERROR_CODES, errorResponse } from "@/lib/expert/execution-guards"
import { META_GOVERNANCE_BLINDSPOT_INVENTORY } from "@/lib/meta-governance-blindspots"

export async function GET() {
  try {
    const userOrRes = await requireExpertUserId()
    if (userOrRes instanceof NextResponse) return userOrRes
    return NextResponse.json({ blindspots: META_GOVERNANCE_BLINDSPOT_INVENTORY })
  } catch (error) {
    return errorResponse(error, ERROR_CODES.INVALID_REQUEST, 500)
  }
}
