import { NextResponse } from "next/server"
import { requireExpertUserId } from "@/lib/expert/auth-server"
import { ERROR_CODES, errorResponse } from "@/lib/expert/execution-guards"
import { runMetaGovernanceAssessment } from "@/lib/meta-evolution-supervisor"

/** Supervisory read over adaptation artefacts — persists MetaGovernanceSnapshot (+ events on WARN/ALERT). */
export async function POST(request: Request) {
  try {
    const userOrRes = await requireExpertUserId()
    if (userOrRes instanceof NextResponse) return userOrRes
    const body = (await request.json()) as {
      supervisoryWindowDays?: number
      persist?: boolean
    }
    const result = await runMetaGovernanceAssessment({
      userId: userOrRes,
      supervisoryWindowDays: body.supervisoryWindowDays,
      persist: body.persist,
    })
    return NextResponse.json(result)
  } catch (error) {
    return errorResponse(error, ERROR_CODES.INVALID_REQUEST, 500)
  }
}
