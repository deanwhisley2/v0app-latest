import { NextResponse } from "next/server"
import { requireExpertUserId } from "@/lib/expert/auth-server"
import { ERROR_CODES, errorResponse } from "@/lib/expert/execution-guards"
import { runCausalGovernanceAssessment } from "@/lib/causal-governance-assessment"

/** Uncertainty-aware probabilistic causal framing — advisory only. */
export async function POST(request: Request) {
  try {
    const userOrRes = await requireExpertUserId()
    if (userOrRes instanceof NextResponse) return userOrRes
    const body = (await request.json()) as {
      causalWindowDays?: number
      persist?: boolean
      persistCorrelatedMetaSnapshot?: boolean
    }
    const result = await runCausalGovernanceAssessment({
      userId: userOrRes,
      causalWindowDays: body.causalWindowDays,
      persist: body.persist,
      persistCorrelatedMetaSnapshot: body.persistCorrelatedMetaSnapshot,
    })
    return NextResponse.json(result)
  } catch (error) {
    return errorResponse(error, ERROR_CODES.INVALID_REQUEST, 500)
  }
}
