import { NextResponse } from "next/server"
import { requireExpertUserId } from "@/lib/expert/auth-server"
import { ERROR_CODES, errorResponse } from "@/lib/expert/execution-guards"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { evaluateAdaptationProposal, persistProposalEvaluation } from "@/lib/evolution-governor"

type RouteContext = { params: Promise<{ id: string }> }

/**
 * Runs constitutional evaluation only — updates proposal verdict in DB; never applies values to live engine state.
 */
export async function POST(_request: Request, context: RouteContext) {
  try {
    const userOrRes = await requireExpertUserId()
    if (userOrRes instanceof NextResponse) return userOrRes
    const { id } = await context.params
    const admin = createAdminClient()
    const { data: proposal, error } = await admin.from("AdaptationProposal").select("subsystem").eq("id", id).eq("userId", userOrRes).maybeSingle()
    if (error) throw new Error(`DB_READ_FAILED: AdaptationProposal — ${error.message}`)
    if (!proposal) {
      return NextResponse.json({ code: ERROR_CODES.INVALID_REQUEST, error: "Proposal not found" }, { status: 404 })
    }
    const evaluation = await evaluateAdaptationProposal({ userId: userOrRes, subsystem: String(proposal.subsystem) })
    await persistProposalEvaluation({ proposalId: id, userId: userOrRes, evaluation })
    return NextResponse.json({ evaluation, note: "Evaluation persisted; no runtime mutation performed." })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    if (msg === "NOT_FOUND") {
      return NextResponse.json({ code: ERROR_CODES.INVALID_REQUEST, error: "Proposal not found" }, { status: 404 })
    }
    return errorResponse(error, ERROR_CODES.INVALID_REQUEST, 500)
  }
}
