import { NextResponse } from "next/server"
import { requireExpertUserId } from "@/lib/expert/auth-server"
import { ERROR_CODES, errorResponse } from "@/lib/expert/execution-guards"
import { runInstitutionalGovernanceAssessment } from "@/lib/institutional-governance-assessment"

/** Triad advisory assessment — epistemic memory, opportunity balance, equilibrium (no mutation). */
export async function POST(request: Request) {
  try {
    const userOrRes = await requireExpertUserId()
    if (userOrRes instanceof NextResponse) return userOrRes
    const body = (await request.json()) as {
      assessmentWindowDays?: number
      persist?: boolean
      persistCorrelatedMetaSnapshot?: boolean
      historySnapshotsLimit?: number
    }
    const result = await runInstitutionalGovernanceAssessment({
      userId: userOrRes,
      assessmentWindowDays: body.assessmentWindowDays,
      persist: body.persist,
      persistCorrelatedMetaSnapshot: body.persistCorrelatedMetaSnapshot,
      historySnapshotsLimit: body.historySnapshotsLimit,
    })
    return NextResponse.json(result)
  } catch (error) {
    return errorResponse(error, ERROR_CODES.INVALID_REQUEST, 500)
  }
}
