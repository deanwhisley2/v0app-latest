import { NextResponse } from "next/server"
import { requireExpertUserId } from "@/lib/expert/auth-server"
import { ERROR_CODES, errorResponse } from "@/lib/expert/execution-guards"
import { runSandboxSimulation } from "@/lib/sandbox-execution-engine"

/**
 * Shadow replay + counterfactual — does not write EngineGovernanceState or place orders.
 */
export async function POST(request: Request) {
  try {
    const userOrRes = await requireExpertUserId()
    if (userOrRes instanceof NextResponse) return userOrRes
    const body = (await request.json()) as {
      symbol?: string
      from?: string
      to?: string
      proposalId?: string | null
      sandboxProfileId?: string | null
      governancePatch?: Record<string, number> | null
      confidencePolicy?: { minCalibratedToExecute?: number; scale?: number } | null
      systemicRiskAssumption?: string
      persist?: boolean
      tradeLimit?: number
    }
    if (!body.symbol?.trim()) {
      return NextResponse.json({ code: ERROR_CODES.INVALID_REQUEST, error: "symbol is required" }, { status: 400 })
    }
    const result = await runSandboxSimulation({
      userId: userOrRes,
      symbol: body.symbol,
      replayFrom: body.from,
      replayTo: body.to,
      proposalId: body.proposalId ?? null,
      sandboxProfileId: body.sandboxProfileId ?? null,
      governancePatch: body.governancePatch ?? null,
      confidencePolicy: body.confidencePolicy ?? null,
      systemicRiskAssumption: body.systemicRiskAssumption,
      persist: body.persist,
      tradeLimit: body.tradeLimit,
    })
    return NextResponse.json(result)
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    if (msg.startsWith("SANDBOX_REJECT:") || msg.startsWith("NOT_FOUND:")) {
      return NextResponse.json({ code: "SANDBOX_REJECTED", error: msg }, { status: 400 })
    }
    return errorResponse(error, ERROR_CODES.INVALID_REQUEST, 500)
  }
}
