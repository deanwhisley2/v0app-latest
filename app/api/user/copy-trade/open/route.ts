import { NextResponse } from "next/server"
import { bearerUserWithGovernance } from "@/lib/server/account-governance"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { recordFinancialEvent } from "@/lib/server/financial-events"
import { casCreditNexusMainOnly, casReserveCopyTradeStake } from "@/lib/server/nexus-main-enforcement"
import { roundUsd2 } from "@/lib/nexus-financial-policy"
import { localUnitsToUsd } from "@/lib/nexus-fx"
import { parseCustomerLocalAmountInput } from "@/lib/customer-amount-parse"
import {
  assertCopyStakeUsd,
  resolvePersonaId,
} from "@/lib/server/container-governance"
import { buildCopyTradeLifecycle } from "@/lib/server/copy-trade-lifecycle"
import { jsonMutationError } from "@/lib/api/mutation-error-envelope"
import { customerTradingApiGuardResponse } from "@/lib/server/customer-trading-api-guard"
import { applyReferralRewardOnFirstTrade } from "@/lib/server/platform-incentives"

export async function POST(request: Request) {
  try {
    const auth = await bearerUserWithGovernance(request, "mutate")
    if ("response" in auth) return auth.response
    const { user } = auth

    const tradingBlock = await customerTradingApiGuardResponse(
      user.id,
      user.email,
      "copy-trade/open",
    )
    if (tradingBlock) return tradingBlock

    const admin = createAdminClient()

    const body = (await request.json().catch(() => ({}))) as {
      stakeUsd?: number
      amountInputLocal?: number
      amountInputRaw?: string
      inputCurrency?: string
      traderPersonaId?: string
    }
    const traderPersonaIdRaw = typeof body.traderPersonaId === "string" ? body.traderPersonaId.trim() : ""
    const inputCurrency =
      typeof body.inputCurrency === "string" ? body.inputCurrency.trim().toUpperCase() : ""

    let stakeUsd = Number(body.stakeUsd ?? 0)
    const rawLocal =
      typeof body.amountInputRaw === "string" && body.amountInputRaw.trim()
        ? parseCustomerLocalAmountInput(body.amountInputRaw)
        : Number(body.amountInputLocal ?? NaN)
    if (Number.isFinite(rawLocal) && rawLocal > 0 && inputCurrency) {
      const fromLocal = localUnitsToUsd(rawLocal, inputCurrency)
      if (fromLocal != null && fromLocal > 0) {
        stakeUsd = fromLocal
      }
    }
    stakeUsd = roundUsd2(stakeUsd)

    if (!Number.isFinite(stakeUsd) || !(stakeUsd > 0)) {
      return jsonMutationError(
        400,
        "INVALID_STAKE",
        "Enter a stake amount greater than zero.",
        "copy-trade/open: stakeUsd invalid or missing.",
      )
    }
    if (!traderPersonaIdRaw) {
      return jsonMutationError(
        400,
        "DESK_REQUIRED",
        "Select a copy desk before starting an allocation.",
        "copy-trade/open: missing traderPersonaId.",
      )
    }

    const minStake = assertCopyStakeUsd(stakeUsd)
    if (!minStake.ok) {
      return jsonMutationError(
        400,
        "STAKE_POLICY",
        minStake.message,
        "copy-trade/open: assertCopyStakeUsd failed.",
      )
    }

    const persona = await resolvePersonaId(admin, traderPersonaIdRaw, "copy")
    if (!persona) {
      return jsonMutationError(
        400,
        "DESK_NOT_FOUND",
        "That copy desk is unknown or inactive. Refresh Container Mode and try again.",
        "copy-trade/open: resolvePersonaId returned null.",
        { suggested_action: "Pick the desk again from the catalog." },
      )
    }

    const reserved = await casReserveCopyTradeStake(admin, user.id, stakeUsd)
    if (!reserved.ok) {
      return jsonMutationError(
        400,
        "INSUFFICIENT_NEXUS_MAIN",
        "Nexus Main does not have enough available balance for this copy allocation. Only Nexus Main may fund desk stakes.",
        "copy-trade/open: casReserveCopyTradeStake failed.",
        {
          suggested_action: "Add funds to Nexus Main or reduce the stake.",
          required: reserved.required,
          available_balance: reserved.available_balance,
        },
      )
    }

    const { data: sessionRow, error: insErr } = await admin
      .from("copy_trade_sessions")
      .insert({
        user_id: user.id,
        trader_persona_id: persona.id,
        stake_amount: roundUsd2(stakeUsd),
        status: "active",
        metadata: { v: 1, ui: { autoAdjust: false }, canonicalPersonaId: persona.id },
      })
      .select("id,created_at")
      .single()

    if (insErr) {
      console.error("[copy-trade/open] session insert failed — refund stake", insErr)
      await casCreditNexusMainOnly(admin, user.id, stakeUsd)
      const isMigration =
        insErr.message.includes("copy_trade_sessions") || insErr.code === "42P01"
      return jsonMutationError(
        500,
        isMigration ? "DATABASE_SCHEMA" : "SESSION_INSERT_FAILED",
        isMigration
          ? "Trading sessions storage is not ready on this environment. Please contact support."
          : "Copy session creation failed. Stake reservation reversed. Retry or contact support.",
        insErr.message,
        { suggested_action: isMigration ? "Apply pending database migrations." : "Retry in a few minutes." },
      )
    }

    const sessionIdForMeta = sessionRow?.id as string
    const lifecycle = buildCopyTradeLifecycle(roundUsd2(stakeUsd), sessionIdForMeta, user.id)
    const { error: lifeErr } = await admin
      .from("copy_trade_sessions")
      .update({
        metadata: {
          v: 1,
          ui: { autoAdjust: false },
          canonicalPersonaId: persona.id,
          lifecycle,
        },
      })
      .eq("id", sessionIdForMeta)
    if (lifeErr) {
      console.error("[copy-trade/open] lifecycle metadata update failed", lifeErr)
    }

    await recordFinancialEvent({
      userId: user.id,
      eventType: "copy_trade_stake_reserved",
      category: "trade",
      amount: roundUsd2(stakeUsd),
      feeAmount: 0,
      balanceSource: "available_balance",
      balanceDestination: "copy_trade_session_lock",
      status: "completed",
      relatedTradeId: sessionRow?.id as string,
      actorType: "user",
      actorId: user.id,
      summary: `Copy-trade stake reserved from Nexus Main (${roundUsd2(stakeUsd)} USD).`,
      metadata: { traderPersonaId: persona.id, sessionId: sessionRow?.id },
    })

    // Referral reward is triggered once, only when referee opens the first trade.
    await applyReferralRewardOnFirstTrade(admin, user.id, `copy_trade_open:${sessionRow?.id as string}`)

    return NextResponse.json({
      success: true,
      ok: true,
      sessionId: sessionRow?.id as string,
      createdAt: sessionRow?.created_at as string,
      balances: { available_balance: reserved.available_balance },
    })
  } catch (e) {
    console.error("[copy-trade/open]", e)
    return jsonMutationError(
      500,
      "INTERNAL_ERROR",
      "Copy allocation could not be opened. Please try again or contact support.",
      e instanceof Error ? e.message : "unknown",
    )
  }
}
