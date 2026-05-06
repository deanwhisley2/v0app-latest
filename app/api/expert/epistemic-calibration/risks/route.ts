import { NextResponse } from "next/server"
import { requireExpertUserId } from "@/lib/expert/auth-server"
import { ERROR_CODES, errorResponse } from "@/lib/expert/execution-guards"
import { SELF_REFERENTIAL_GOVERNANCE_RISK_INVENTORY } from "@/lib/self-referential-governance-risks"

export async function GET() {
  try {
    const userOrRes = await requireExpertUserId()
    if (userOrRes instanceof NextResponse) return userOrRes
    return NextResponse.json({ risks: SELF_REFERENTIAL_GOVERNANCE_RISK_INVENTORY })
  } catch (error) {
    return errorResponse(error, ERROR_CODES.INVALID_REQUEST, 500)
  }
}
