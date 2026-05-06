import { NextResponse } from "next/server"
import { requireExpertUserId } from "@/lib/expert/auth-server"
import { ERROR_CODES, errorResponse } from "@/lib/expert/execution-guards"
import {
  runMultiWorldComparativeSimulation,
  type ComparativeEvolutionScenario,
} from "@/lib/multi-world-simulation-engine"
import type { RegimeStressMode } from "@/lib/sandbox-execution-engine"

const CATEGORY = new Set([
  "TREND",
  "VOLATILITY",
  "LIQUIDITY",
  "CASCADE",
  "RECOVERY",
  "CORRELATION",
  "LATENCY_PROXY",
  "SPREAD_STRESS",
])

function parseWorlds(body: unknown): ComparativeEvolutionScenario[] | undefined {
  if (!Array.isArray(body) || body.length === 0) return undefined
  const out: ComparativeEvolutionScenario[] = []
  for (const w of body) {
    if (!w || typeof w !== "object") continue
    const o = w as Record<string, unknown>
    const id = typeof o.id === "string" ? o.id : null
    const label = typeof o.label === "string" ? o.label : null
    const rawCat = typeof o.category === "string" ? o.category : "VOLATILITY"
    const category = CATEGORY.has(rawCat) ? rawCat : "VOLATILITY"
    const mods = o.modifiers
    if (!id || !label || !mods || typeof mods !== "object") continue
    const m = mods as Record<string, unknown>
    const sys = typeof m.systemicRiskAssumption === "string" ? m.systemicRiskAssumption : null
    if (!sys) continue
    out.push({
      id: id.slice(0, 80),
      label: label.slice(0, 240),
      category: category as ComparativeEvolutionScenario["category"],
      modifiers: {
        systemicRiskAssumption: sys,
        regimeStressMode: (typeof m.regimeStressMode === "string" ? m.regimeStressMode : undefined) as
          | RegimeStressMode
          | undefined,
        hypotheticalCompressionStressMultiplier:
          typeof m.hypotheticalCompressionStressMultiplier === "number" ? m.hypotheticalCompressionStressMultiplier : undefined,
      },
    })
  }
  return out.length ? out : undefined
}

/**
 * Multi-world comparative fitness — aggregates many sandbox replays; no production mutation.
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
      suiteLabel?: string
      worlds?: unknown
      persistComparative?: boolean
      tradeLimit?: number
    }
    if (!body.symbol?.trim()) {
      return NextResponse.json({ code: ERROR_CODES.INVALID_REQUEST, error: "symbol is required" }, { status: 400 })
    }
    const worlds = parseWorlds(body.worlds)

    const result = await runMultiWorldComparativeSimulation({
      userId: userOrRes,
      symbol: body.symbol,
      replayFrom: body.from,
      replayTo: body.to,
      proposalId: body.proposalId ?? null,
      sandboxProfileId: body.sandboxProfileId ?? null,
      governancePatch: body.governancePatch ?? null,
      confidencePolicy: body.confidencePolicy ?? null,
      worlds,
      suiteLabel: body.suiteLabel,
      persistComparative: body.persistComparative,
      tradeLimit: body.tradeLimit,
    })
    return NextResponse.json(result)
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    if (msg.startsWith("SANDBOX_REJECT:")) {
      return NextResponse.json({ code: "SANDBOX_REJECTED", error: msg }, { status: 400 })
    }
    return errorResponse(error, ERROR_CODES.INVALID_REQUEST, 500)
  }
}
