import { NextResponse } from "next/server"
import { requireExpertUserId } from "@/lib/expert/auth-server"
import { ERROR_CODES, errorResponse } from "@/lib/expert/execution-guards"
import { runTemporalEvolutionAnalysis, type EraSplitMode, type TemporalEraBoundary } from "@/lib/temporal-evolution-engine"

function parseExplicitEras(body: unknown): TemporalEraBoundary[] | undefined {
  if (!Array.isArray(body) || body.length === 0) return undefined
  const out: TemporalEraBoundary[] = []
  for (const e of body) {
    if (!e || typeof e !== "object") continue
    const o = e as Record<string, unknown>
    const id = typeof o.id === "string" ? o.id : `era_${out.length}`
    const label = typeof o.label === "string" ? o.label : `Era ${out.length + 1}`
    const from = typeof o.replayFromIso === "string" ? o.replayFromIso : typeof o.from === "string" ? o.from : null
    const to = typeof o.replayToIso === "string" ? o.replayToIso : typeof o.to === "string" ? o.to : null
    if (!from || !to) continue
    out.push({ id: id.slice(0, 120), label: label.slice(0, 240), replayFromIso: from, replayToIso: to })
  }
  return out.length ? out : undefined
}

/**
 * Long-horizon temporal evolution — era-sliced shadow replay + structural rotation. No production mutation.
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
      eraSplitMode?: EraSplitMode
      eraStrideDays?: number
      explicitEras?: unknown
      suiteLabel?: string
      persistTemporal?: boolean
      tradeLimit?: number
      disableStructuralRotation?: boolean
    }
    if (!body.symbol?.trim()) {
      return NextResponse.json({ code: ERROR_CODES.INVALID_REQUEST, error: "symbol is required" }, { status: 400 })
    }
    const explicit = parseExplicitEras(body.explicitEras)
    if (!explicit?.length && (!body.from?.trim() || !body.to?.trim())) {
      return NextResponse.json(
        {
          code: ERROR_CODES.INVALID_REQUEST,
          error: "replay window required: provide from+to (ISO) or explicitEras[]",
        },
        { status: 400 }
      )
    }

    const result = await runTemporalEvolutionAnalysis({
      userId: userOrRes,
      symbol: body.symbol,
      replayFrom: body.from,
      replayTo: body.to,
      proposalId: body.proposalId ?? null,
      sandboxProfileId: body.sandboxProfileId ?? null,
      governancePatch: body.governancePatch ?? null,
      confidencePolicy: body.confidencePolicy ?? null,
      eraSplitMode: explicit?.length ? undefined : body.eraSplitMode,
      eraStrideDays: body.eraStrideDays,
      explicitEras: explicit,
      suiteLabel: body.suiteLabel ?? undefined,
      persistTemporal: body.persistTemporal,
      tradeLimit: body.tradeLimit,
      disableStructuralRotation: body.disableStructuralRotation,
    })
    return NextResponse.json(result)
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    if (msg.startsWith("SANDBOX_REJECT:") || msg.startsWith("TEMPORAL_INPUT:")) {
      return NextResponse.json({ code: "TEMPORAL_REJECTED", error: msg }, { status: 400 })
    }
    return errorResponse(error, ERROR_CODES.INVALID_REQUEST, 500)
  }
}
