import { NextRequest, NextResponse } from "next/server"
import { requireExpertUserId } from "@/lib/expert/auth-server"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { ERROR_CODES, errorResponse } from "@/lib/expert/execution-guards"
import { runObservationWindowTick } from "@/lib/observation-window-tick"

/**
 * GET — recent observational ticks from EvolutionAuditEvent.
 * POST — run one observational tick immediately (manual smoke; same as daemon tick).
 */
export async function GET(request: NextRequest) {
  try {
    const userOrRes = await requireExpertUserId()
    if (userOrRes instanceof NextResponse) return userOrRes
    const limit = Math.min(80, Math.max(1, Number(request.nextUrl.searchParams.get("limit") ?? "40")))
    const admin = createAdminClient()
    const { data, error } = await admin
      .from("EvolutionAuditEvent")
      .select("id,eventType,details,createdAt")
      .eq("userId", userOrRes)
      .eq("eventType", "OBSERVATION_WINDOW_TICK")
      .order("createdAt", { ascending: false })
      .limit(limit)
    if (error) throw new Error(`DB_READ_FAILED: EvolutionAuditEvent — ${error.message}`)
    return NextResponse.json({ ticks: data ?? [], note: "OBSERVATION_WINDOW_TICK audit trail — no live orders." })
  } catch (error) {
    return errorResponse(error, ERROR_CODES.INVALID_REQUEST, 500)
  }
}

export async function POST(request: NextRequest) {
  try {
    const userOrRes = await requireExpertUserId()
    if (userOrRes instanceof NextResponse) return userOrRes
    const body = (await request.json().catch(() => ({}))) as {
      symbols?: string[]
      analysisWindowSeconds?: number
      governanceProbeQuoteUsd?: number
      persistSandbox?: boolean
      includeStabilityRefresh?: boolean
    }
    const symbols =
      Array.isArray(body.symbols) && body.symbols.length > 0
        ? body.symbols.map((s) => String(s).trim().toUpperCase()).filter(Boolean)
        : ["BTCUSDT"]
    const result = await runObservationWindowTick({
      userId: userOrRes,
      symbols,
      analysisWindowSeconds: body.analysisWindowSeconds ?? 60,
      governanceProbeQuoteUsd: body.governanceProbeQuoteUsd ?? 5,
      persistSandbox: body.persistSandbox !== false,
      includeStabilityRefresh: body.includeStabilityRefresh === true,
    })
    return NextResponse.json({ ok: true, result })
  } catch (error) {
    return errorResponse(error, ERROR_CODES.INVALID_REQUEST, 500)
  }
}
