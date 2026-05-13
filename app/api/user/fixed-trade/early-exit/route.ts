import { NextResponse } from "next/server"
import { bearerUserWithGovernance } from "@/lib/server/account-governance"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { recordFinancialEvent } from "@/lib/server/financial-events"
import { buildContainerDailySchedule, scheduledEarnedUsdSmooth, totalScheduleTargetUsd } from "@/lib/container-earnings-schedule"
import type { FixPeriodMonths } from "@/lib/container-earnings-schedule"
import { computeEarlyExitSettlementUsd } from "@/lib/nexus-financial-policy"
import { officialLeaseEndDate } from "@/lib/fixed-trade-session-lease"

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export async function POST(request: Request) {
  try {
    const auth = await bearerUserWithGovernance(request, "mutate")
    if ("response" in auth) return auth.response
    const { user } = auth

    const body = (await request.json().catch(() => ({}))) as { sessionId?: string }
    const sessionId = body.sessionId?.trim()
    if (!sessionId) return NextResponse.json({ error: "sessionId required" }, { status: 400 })

    const admin = createAdminClient()
    const { data: session, error: sErr } = await admin
      .from("fixed_trade_sessions")
      .select(
        "id,user_id,principal_amount,insurance_fee_amount,risk_class,fix_period_months,status,seed_key,created_at"
      )
      .eq("id", sessionId)
      .maybeSingle()

    if (sErr) throw new Error(sErr.message)
    if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 })
    if (session.user_id !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    if (session.status !== "active") {
      return NextResponse.json({ error: "Session is not active" }, { status: 400 })
    }

    const principalUsd = round2(Number(session.principal_amount ?? 0))
    const openingInsuranceUsd = round2(Number(session.insurance_fee_amount ?? 0))
    const months = Number(session.fix_period_months) as FixPeriodMonths
    const createdAt = session.created_at as string
    const leaseEnd = officialLeaseEndDate(createdAt, months)
    const now = new Date()

    if (now.getTime() >= leaseEnd.getTime()) {
      return NextResponse.json(
        { error: "Lease period has ended — use normal completion/settlement, not early exit." },
        { status: 400 }
      )
    }

    const seedKey =
      (session.seed_key as string | null)?.trim() ||
      `${session.id}-${principalUsd}-${months}-${createdAt}`

    const schedule = buildContainerDailySchedule(principalUsd, months, seedKey, openingInsuranceUsd)
    const cap = totalScheduleTargetUsd(schedule)
    const sessionEarnedUsd = round2(
      Math.min(cap, scheduledEarnedUsdSmooth(schedule, new Date(createdAt), now))
    )

    const settlement = computeEarlyExitSettlementUsd(principalUsd, openingInsuranceUsd, sessionEarnedUsd)

    const { data: bal, error: bErr } = await admin
      .from("user_balances")
      .select("available_balance, current_stake")
      .eq("user_id", user.id)
      .maybeSingle()
    if (bErr) throw new Error(bErr.message)

    const stake = round2(Number(bal?.current_stake ?? 0))
    if (stake < principalUsd) {
      return NextResponse.json(
        {
          error: "Accounting mismatch: locked stake is lower than session principal. Escalate support.",
          current_stake: stake,
          principalUsd,
        },
        { status: 409 }
      )
    }

    const available = round2(Number(bal?.available_balance ?? 0))
    const nextStake = round2(stake - principalUsd)
    const nextAvailable = round2(available + settlement.totalCreditedToMainUsd)

    const { error: upErr } = await admin
      .from("user_balances")
      .upsert(
        {
          user_id: user.id,
          available_balance: nextAvailable,
          current_stake: nextStake,
          last_updated: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      )
    if (upErr) throw new Error(upErr.message)

    const cancelledAt = new Date().toISOString()
    const { error: sessErr } = await admin
      .from("fixed_trade_sessions")
      .update({
        status: "cancelled_early",
        cancelled_at: cancelledAt,
      })
      .eq("id", sessionId)
      .eq("user_id", user.id)

    if (sessErr) throw new Error(sessErr.message)

    const ref = crypto.randomUUID()

    await recordFinancialEvent({
      userId: user.id,
      eventType: "fixed_trade_early_exit_settlement",
      category: "trade",
      amount: settlement.totalCreditedToMainUsd,
      feeAmount: 0,
      balanceSource: "fixed_session_release",
      balanceDestination: "available_balance",
      status: "completed",
      transactionRef: ref,
      relatedTradeId: sessionId,
      actorType: "user",
      actorId: user.id,
      summary:
        "Early pullout: penalties (10% agreement + insurance from principal only); full session earnings + net principal → Nexus Main; stake released.",
      metadata: {
        principalUsd: settlement.principalUsd,
        agreementPenaltyUsd: settlement.agreementPenaltyUsd,
        insuranceExitFromPrincipalUsd: settlement.insuranceExitFromPrincipalUsd,
        sessionEarnedUsd: settlement.sessionEarnedUsd,
        netPrincipalReturnedUsd: settlement.netPrincipalReturnedUsd,
        totalCreditedToMainUsd: settlement.totalCreditedToMainUsd,
      },
    })

    return NextResponse.json({
      ok: true,
      sessionId,
      settlement,
      balances: {
        available_balance: nextAvailable,
        current_stake: nextStake,
      },
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Internal error" },
      { status: 500 }
    )
  }
}
