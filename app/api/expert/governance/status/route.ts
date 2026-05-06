import { NextResponse } from "next/server"
import { requireExpertUserId } from "@/lib/expert/auth-server"
import { ERROR_CODES, errorResponse } from "@/lib/expert/execution-guards"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { getGovernanceState } from "@/lib/global-execution-governor"
import { resolveAuthoritativeMarketState } from "@/lib/market-state-authority"

export async function GET() {
  try {
    const userOrRes = await requireExpertUserId()
    if (userOrRes instanceof NextResponse) return userOrRes
    const governance = await getGovernanceState()
    await resolveAuthoritativeMarketState({
      consumer: "api-governance-status",
      scope: "GLOBAL",
      minRefreshMs: 30_000,
    })
    const admin = createAdminClient()
    const { data: liveStructure } = await admin.from("LiveStructureState").select("*").eq("scope", "GLOBAL").maybeSingle()
    return NextResponse.json({ governance, liveStructure })
  } catch (error) {
    return errorResponse(error, ERROR_CODES.INVALID_REQUEST, 500)
  }
}
