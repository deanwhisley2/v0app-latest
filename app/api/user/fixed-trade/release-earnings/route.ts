import { NextResponse } from "next/server"
import { bearerUserWithGovernance } from "@/lib/server/account-governance"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { recordFinancialEvent } from "@/lib/server/financial-events"
import { getTradingUserLevel } from "@/lib/server/security-authz"
import {
  computeFixedSessionPolicyGrossUsd,
  fixedSessionWithdrawPercent,
  type FixedSessionEarnedRow,
} from "@/lib/server/fixed-trade-earnings-snapshot"
import type { FixPeriodMonths } from "@/lib/container-earnings-schedule"
import { roundUsd2 } from "@/lib/nexus-financial-policy"

const RELEASE_FEE_RATE = 0.01

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export async function POST(request: Request) {
  try {
    const auth = await bearerUserWithGovernance(request, "mutate")
    if ("response" in auth) return auth.response
    const { user } = auth
    const level = await getTradingUserLevel(user.id)
    if (level === 2 || level === 5) {
      return NextResponse.json({ error: "This account type cannot release fixed-trade earnings." }, { status: 403 })
    }

    const body = (await request.json().catch(() => ({}))) as { sessionId?: string }
    const sessionId = typeof body.sessionId === "string" ? body.sessionId.trim() : ""
    if (!sessionId) return NextResponse.json({ error: "sessionId required" }, { status: 400 })

    const admin = createAdminClient()
    const { data: row, error: fErr } = await admin
      .from("fixed_trade_sessions")
      .select(
        "id,user_id,status,principal_amount,insurance_fee_amount,fix_period_months,seed_key,created_at,metadata,cumulative_earnings_released_usd,last_earnings_release_at"
      )
      .eq("id", sessionId)
      .maybeSingle()
    if (fErr) throw new Error(fErr.message)
    if (!row) return NextResponse.json({ error: "Session not found" }, { status: 404 })
    if (row.user_id !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    if (row.status !== "active") {
      return NextResponse.json({ error: "Session is not active" }, { status: 400 })
    }

    const now = new Date()
    const months = Number(row.fix_period_months) as FixPeriodMonths
    const grossPolicy = computeFixedSessionPolicyGrossUsd(row as FixedSessionEarnedRow, now)
    if (!(grossPolicy > 0)) {
      return NextResponse.json({ error: "No accrued earnings available to release yet." }, { status: 400 })
    }

    const cumulative = roundUsd2(Number((row as { cumulative_earnings_released_usd?: unknown }).cumulative_earnings_released_usd ?? 0))
    const lastAtRaw = (row as { last_earnings_release_at?: string | null }).last_earnings_release_at
    const createdAt = new Date(String(row.created_at))

    const MS_DAY = 86_400_000
    const d = Math.floor((now.getTime() - createdAt.getTime()) / MS_DAY)
    const currentPeriod = Math.floor(d / 5)
    let lastPeriod = -1
    if (lastAtRaw) {
      const ld = Math.floor((new Date(lastAtRaw).getTime() - createdAt.getTime()) / MS_DAY)
      lastPeriod = Math.floor(ld / 5)
    }
    const calendarEligible = currentPeriod >= 1 && currentPeriod > lastPeriod

    if (!calendarEligible) {
      const nextUnlockDay = lastPeriod < 0 ? 5 : (lastPeriod + 1) * 5
      const waitDays = Math.max(0, nextUnlockDay - d)
      return NextResponse.json(
        {
          error: "WITHDRAW_WINDOW_LOCKED",
          waitDays,
          nextUnlockDay,
          message: `Next earnings release unlocks in about ${waitDays} day(s) (day ${nextUnlockDay} of your session).`,
        },
        { status: 423 }
      )
    }

    const pct = fixedSessionWithdrawPercent(months) / 100
    const headroom = roundUsd2(Math.max(0, grossPolicy - cumulative))
    if (!(headroom > 0)) {
      return NextResponse.json({ error: "All accrued earnings for this window are already in container liquid." }, { status: 400 })
    }

    const sliceCap = roundUsd2(headroom * pct)
    const toReleaseGross = roundUsd2(Math.max(0, Math.min(sliceCap, headroom)))
    if (!(toReleaseGross > 0)) {
      return NextResponse.json({ error: "No eligible earnings slice for this release window." }, { status: 400 })
    }

    const fee = round2(toReleaseGross * RELEASE_FEE_RATE)
    const creditedLiquid = round2(toReleaseGross - fee)
    const nextCumulative = roundUsd2(cumulative + toReleaseGross)
    const nowIso = now.toISOString()

    const { data: bal, error: bErr } = await admin
      .from("user_balances")
      .select("available_balance, container_withdrawable_earnings")
      .eq("user_id", user.id)
      .maybeSingle()
    if (bErr) throw new Error(bErr.message)
    if (!bal) return NextResponse.json({ error: "Balance row not found" }, { status: 404 })

    const nextLiquid = round2(Number(bal.container_withdrawable_earnings ?? 0) + creditedLiquid)

    const prevLiquid = round2(Number(bal.container_withdrawable_earnings ?? 0))

    const { error: uBalErr } = await admin
      .from("user_balances")
      .update({
        container_withdrawable_earnings: nextLiquid,
        last_updated: nowIso,
      })
      .eq("user_id", user.id)
    if (uBalErr) throw new Error(uBalErr.message)

    const { error: uSessErr } = await admin
      .from("fixed_trade_sessions")
      .update({
        cumulative_earnings_released_usd: nextCumulative,
        last_earnings_release_at: nowIso,
      })
      .eq("id", sessionId)
      .eq("user_id", user.id)
      .eq("status", "active")
    if (uSessErr) {
      await admin
        .from("user_balances")
        .update({ container_withdrawable_earnings: prevLiquid, last_updated: nowIso })
        .eq("user_id", user.id)
      throw new Error(uSessErr.message)
    }

    await recordFinancialEvent({
      userId: user.id,
      eventType: "fixed_trade_earnings_to_container_liquid",
      category: "container",
      amount: toReleaseGross,
      feeAmount: fee,
      balanceSource: "fixed_trade_session_accrual",
      balanceDestination: "container_withdrawable_earnings",
      status: "completed",
      relatedTradeId: sessionId,
      actorType: "user",
      actorId: user.id,
      summary: `Fixed-trade earnings released to container liquid (${roundUsd2(creditedLiquid)} USD net of ${(RELEASE_FEE_RATE * 100).toFixed(1)}% release fee).`,
      metadata: { grossReleasedUsd: toReleaseGross, feeRate: RELEASE_FEE_RATE, fixPeriodMonths: months },
    })

    return NextResponse.json({
      ok: true,
      releasedGrossUsd: toReleaseGross,
      feeUsd: fee,
      creditedLiquidUsd: creditedLiquid,
      cumulativeReleasedUsd: nextCumulative,
      policyGrossUsd: grossPolicy,
      balances: {
        available_balance: round2(Number(bal.available_balance ?? 0)),
        container_withdrawable_earnings: nextLiquid,
      },
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Internal error" }, { status: 500 })
  }
}
