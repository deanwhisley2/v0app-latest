import { NextResponse } from "next/server"
import { requireExpertUserId } from "@/lib/expert/auth-server"
import { ERROR_CODES, errorResponse } from "@/lib/expert/execution-guards"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { createAdaptationProposal, type ProposalStatus } from "@/lib/evolution-governor"

export async function GET(request: Request) {
  try {
    const userOrRes = await requireExpertUserId()
    if (userOrRes instanceof NextResponse) return userOrRes
    const { searchParams } = new URL(request.url)
    const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit") ?? 50)))
    const admin = createAdminClient()
    const { data, error } = await admin
      .from("AdaptationProposal")
      .select("*")
      .eq("userId", userOrRes)
      .order("createdAt", { ascending: false })
      .limit(limit)
    if (error) throw new Error(`DB_READ_FAILED: AdaptationProposal list — ${error.message}`)
    return NextResponse.json({ proposals: data ?? [] })
  } catch (error) {
    return errorResponse(error, ERROR_CODES.INVALID_REQUEST, 500)
  }
}

export async function POST(request: Request) {
  try {
    const userOrRes = await requireExpertUserId()
    if (userOrRes instanceof NextResponse) return userOrRes
    const body = (await request.json()) as {
      subsystem?: string
      parameterKey?: string
      proposedValue?: unknown
      currentValueSnapshot?: unknown
      expectedImprovement?: string
      evidence?: unknown
      stabilityImpactEstimate?: unknown
      rollbackPlan?: string
      status?: string
    }
    if (!body.subsystem?.trim() || !body.parameterKey?.trim() || body.proposedValue === undefined) {
      return NextResponse.json(
        { code: ERROR_CODES.INVALID_REQUEST, error: "subsystem, parameterKey, and proposedValue are required" },
        { status: 400 }
      )
    }
    const proposal = await createAdaptationProposal({
      userId: userOrRes,
      subsystem: body.subsystem,
      parameterKey: body.parameterKey,
      proposedValue: body.proposedValue,
      currentValueSnapshot: body.currentValueSnapshot,
      expectedImprovement: body.expectedImprovement,
      evidence: body.evidence,
      stabilityImpactEstimate: body.stabilityImpactEstimate,
      rollbackPlan: body.rollbackPlan,
      status: (body.status as ProposalStatus | undefined) ?? undefined,
    })
    return NextResponse.json({ proposal })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    if (msg.startsWith("RATE_LIMIT:")) {
      return NextResponse.json({ code: "RATE_LIMITED", error: msg }, { status: 429 })
    }
    return errorResponse(error, ERROR_CODES.INVALID_REQUEST, 500)
  }
}
