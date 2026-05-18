import { NextResponse } from "next/server"
import { bearerUserWithGovernance } from "@/lib/server/account-governance"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { recordFinancialEvent } from "@/lib/server/financial-events"
import { buildContainerDailySchedule, scheduledEarnedUsdSmooth, totalScheduleTargetUsd } from "@/lib/container-earnings-schedule"
import type { FixPeriodMonths } from "@/lib/container-earnings-schedule"
import { computeEarlyExitSettlementUsd } from "@/lib/nexus-financial-policy"
import { officialLeaseEndDate } from "@/lib/fixed-trade-session-lease"
import { jsonMutationError } from "@/lib/api/mutation-error-envelope"

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
    if (!sessionId) {
      return jsonMutationError(
        400,
        "SESSION_ID_REQUIRED",
        "Session reference missing. Refresh and try again.",
        "early-exit: missing sessionId.",
        { suggested_action: "Re-open the desk card and retry early exit." },
      )
    }

    const admin = createAdminClient()
    const { data: session, error: sErr } = await admin
      .from("fixed_trade_sessions")
      .select(
        "id,user_id,principal_amount,insurance_fee_amount,risk_class,fix_period_months,status,seed_key,created_at,metadata"
      )
      .eq("id", sessionId)
      .maybeSingle()

    if (sErr) throw new Error(sErr.message)
    if (!session) {
      return jsonMutationError(
        404,
        "SESSION_NOT_FOUND",
        "Fixed allocation not found.",
        "early-exit: no row for session id.",
        { suggested_action: "Refresh Container Mode." },
      )
    }
    if (session.user_id !== user.id) {
      return jsonMutationError(
        403,
        "FORBIDDEN",
        "You cannot early-exit an allocation that belongs to another account.",
        "early-exit: user_id mismatch.",
      )
    }
    if (session.status !== "active") {
      return jsonMutationError(
        400,
        "EARLY_EXIT_NOT_ALLOWED",
        "This allocation is not active, so early exit is not available here.",
        `early-exit: status=${String(session.status)}.`,
        {
          suggested_action:
            session.status === "matured" || session.status === "completed"
              ? "Use wallet history for completed sessions."
              : "Refresh to see the current session state.",
        },
      )
    }

    const principalUsd = round2(Number(session.principal_amount ?? 0))
    const openingInsuranceUsd = round2(Number(session.insurance_fee_amount ?? 0))
    const months = Number(session.fix_period_months) as FixPeriodMonths
    const createdAt = session.created_at as string
    const leaseEnd = officialLeaseEndDate(createdAt, months)
    const now = new Date()

    if (now.getTime() >= leaseEnd.getTime()) {
      return jsonMutationError(
        400,
        "EARLY_EXIT_LEASE_ENDED",
        "The lease period has already ended. Use normal maturity settlement instead of early exit.",
        "early-exit: now >= lease_end.",
        {
          suggested_action: "Use “Refresh settlement” or wait for automatic maturity processing.",
          lease_ends_at: leaseEnd.toISOString(),
        },
      )
    }

    const seedKey =
      (session.seed_key as string | null)?.trim() ||
      `${session.id}-${principalUsd}-${months}-${createdAt}`

    const sessionMd = (session.metadata ?? {}) as Record<string, unknown>
    const legacyGrossPrincipal =
      !(typeof sessionMd.v === "number" && sessionMd.v >= 2) && sessionMd.gross_commit_usd == null
    const insuranceForSchedule = legacyGrossPrincipal ? openingInsuranceUsd : 0
    const schedule = buildContainerDailySchedule(principalUsd, months, seedKey, insuranceForSchedule)
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
      return jsonMutationError(
        409,
        "STAKE_PRINCIPAL_MISMATCH",
        "Stake and session principal mismatch. Contact support.",
        `early-exit: stake ${stake} < principal ${principalUsd}.`,
        {
          suggested_action: "Contact support with approximate allocation time; do not repeat early exit.",
        },
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
        "Early exit: penalties (10% agreement + insurance from principal only); full session earnings + net principal → Nexus Main; stake released.",
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
      success: true,
      sessionId,
      settlement,
      balances: {
        available_balance: nextAvailable,
        current_stake: nextStake,
      },
    })
  } catch (e) {
    console.error("[early-exit]", e)
    return jsonMutationError(
      500,
      "INTERNAL_ERROR",
      "Early exit could not complete. Please try again or contact support.",
      e instanceof Error ? e.message : "unknown",
    )
  }
}
