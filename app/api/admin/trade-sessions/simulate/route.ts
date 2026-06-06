import { NextResponse } from "next/server"
import { getUserFromBearer } from "@/lib/auth-api"
import { requireLiquidityAdminLevel5 } from "@/lib/server/security-authz"
import { calculateTimeWeightedYield, validateMaxYieldPercent } from "@/lib/server/time-weighted-yield-engine"

export async function POST(request: Request) {
  try {
    const actor = await getUserFromBearer(request)
    if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    await requireLiquidityAdminLevel5(actor)

    const body = (await request.json().catch(() => ({}))) as {
      startAt?: string
      endAt?: string
      maxYieldPercent?: number
      testUsers?: Array<{ capital: number; joinOffsetHours: number }>
    }

    const startAt = body.startAt ?? ""
    const endAt = body.endAt ?? ""
    if (!startAt || !endAt) {
      return NextResponse.json({ error: "startAt and endAt required" }, { status: 400 })
    }

    const sessionStart = new Date(startAt)
    const sessionEnd = new Date(endAt)
    if (!(sessionEnd.getTime() > sessionStart.getTime())) {
      return NextResponse.json({ error: "endAt must be after startAt" }, { status: 400 })
    }

    const maxYieldPercent = validateMaxYieldPercent(body.maxYieldPercent)
    const testUsers = body.testUsers ?? [
      { capital: 1000, joinOffsetHours: -0.5 },
      { capital: 1248.01, joinOffsetHours: 2 },
      { capital: 500, joinOffsetHours: 4 },
    ]

    const results = []
    let totalPayoutUsd = 0

    for (const user of testUsers) {
      const joinTime = new Date(sessionStart.getTime() + user.joinOffsetHours * 3_600_000)
      const calculation = calculateTimeWeightedYield({
        sessionId: "simulation",
        userId: `sim_${user.capital}`,
        capitalAtJoinUsd: user.capital,
        joinTime,
        sessionStart,
        sessionEnd,
        maxYieldPercent,
      })
      results.push({
        capital_at_join: user.capital,
        join_offset_hours: user.joinOffsetHours,
        join_time: joinTime.toISOString(),
        effective_start_time: calculation.effectiveStartTime.toISOString(),
        participation_ratio: calculation.participationRatio,
        earned_percent: calculation.earnedPercent,
        profit_usd: calculation.profitUsd,
        is_early_bird: calculation.isEarlyBird,
        rejected: calculation.rejected,
        rejection_reason: calculation.rejectionReason ?? null,
      })
      if (!calculation.rejected) totalPayoutUsd += calculation.profitUsd
    }

    const sessionDurationHours =
      (sessionEnd.getTime() - sessionStart.getTime()) / 3_600_000

    return NextResponse.json({
      ok: true,
      session_duration_hours: sessionDurationHours,
      max_yield_percent: maxYieldPercent,
      total_payout_usd: Math.round(totalPayoutUsd * 100) / 100,
      results,
      note: "Deterministic simulation — identical inputs always produce identical outputs.",
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Forbidden"
    return NextResponse.json({ error: msg }, { status: msg.includes("INVALID") ? 400 : 403 })
  }
}
