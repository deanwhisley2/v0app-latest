import { NextResponse } from "next/server"
import { bearerUserWithGovernance } from "@/lib/server/account-governance"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { recordFinancialEvent } from "@/lib/server/financial-events"
import { mapTradingProfileToDeskTier, traderEligibleForFixedTrade } from "@/lib/fix-trade-access"
import type { FixTradeRiskLevel } from "@/lib/fix-trade-access"
import {
  fixInsuranceAndWithdrawFees,
  roundUsd2,
  splitFixedTradeOpenCommitUsd,
} from "@/lib/nexus-financial-policy"
import { treasury } from "@/lib/financial/treasury-authority"
import { casOpenFixedTradeDebit } from "@/lib/server/nexus-main-enforcement"
import { resolveFixedTradeMarketLock } from "@/lib/server/fixed-trade-market-lock"
import { officialLeaseEndDate } from "@/lib/fixed-trade-session-lease"
import {
  assertFixPrincipalUsd,
  buildUnlockContext,
  personaUnlocked,
  resolvePersonaId,
} from "@/lib/server/container-governance"
import { getLaunchStarterFixPersonaId, getPlatformLaunchStatus, launchPromotionsActive } from "@/lib/server/platform-launch"
import { buildFixedTradeLifecycleV2 } from "@/lib/server/fixed-trade-lifecycle-v2"
import { jsonMutationError } from "@/lib/api/mutation-error-envelope"

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export async function POST(request: Request) {
  try {
    const auth = await bearerUserWithGovernance(request, "mutate")
    if ("response" in auth) return auth.response
    const { user } = auth

    const body = (await request.json().catch(() => ({}))) as {
      /** Total commitment from Nexus Main (insurance carved inside this amount). */
      principalUsd?: number
      commitUsd?: number
      riskClass?: FixTradeRiskLevel
      fixPeriodMonths?: 1 | 3 | 6
      traderPersonaId?: string
      seedKey?: string
    }

    const grossCommitUsd = Number(body.commitUsd ?? body.principalUsd ?? 0)
    const riskClass = body.riskClass
    const fixPeriodMonths = body.fixPeriodMonths
    const traderPersonaIdRaw = typeof body.traderPersonaId === "string" ? body.traderPersonaId.trim() : ""

    if (!Number.isFinite(grossCommitUsd) || grossCommitUsd <= 0) {
      return jsonMutationError(
        400,
        "INVALID_PRINCIPAL",
        "Enter a valid allocation amount greater than zero.",
        "fixed-trade/open: gross commit invalid.",
      )
    }
    if (riskClass !== "Low" && riskClass !== "Medium" && riskClass !== "High") {
      return jsonMutationError(
        400,
        "INVALID_RISK_CLASS",
        "Desk risk class was not recognized. Refresh and pick Low, Medium, or High again.",
        "fixed-trade/open: invalid riskClass.",
      )
    }
    if (fixPeriodMonths !== 1 && fixPeriodMonths !== 3 && fixPeriodMonths !== 6) {
      return jsonMutationError(
        400,
        "INVALID_PERIOD",
        "Lock period must be 1, 3, or 6 months.",
        "fixed-trade/open: fixPeriodMonths invalid.",
      )
    }
    if (!traderPersonaIdRaw) {
      return jsonMutationError(
        400,
        "DESK_REQUIRED",
        "Select a fixed desk before opening an allocation.",
        "fixed-trade/open: missing traderPersonaId.",
      )
    }

    const admin = createAdminClient()
    const { data: profile, error: pErr } = await admin
      .from("profiles")
      .select("trading_user_level, retailer_credit_seller")
      .eq("id", user.id)
      .maybeSingle()
    if (pErr) throw new Error(pErr.message)

    const tradingLv = Number(profile?.trading_user_level ?? 1)
    const retailerDesk = tradingLv === 2 && Boolean(profile?.retailer_credit_seller)
    if (tradingLv === 5 || retailerDesk) {
      return jsonMutationError(
        403,
        "ACCOUNT_TYPE_BLOCKED",
        "Designated retailer desks and Level-5 accounts cannot open fixed trades from this flow.",
        "fixed-trade/open: level 5 or retailer desk.",
      )
    }
    const userLevel = mapTradingProfileToDeskTier(tradingLv)

    const persona = await resolvePersonaId(admin, traderPersonaIdRaw, "fix")
    if (!persona || !persona.risk_class) {
      return jsonMutationError(
        400,
        "DESK_NOT_FOUND",
        "That fixed desk is unknown or inactive. Refresh Container Mode and try again.",
        "fixed-trade/open: resolvePersonaId failed.",
        { suggested_action: "Pick the desk again from the catalog." },
      )
    }
    if (persona.risk_class !== riskClass) {
      return jsonMutationError(
        400,
        "DESK_RISK_MISMATCH",
        "The risk class no longer matches the desk you selected. Refresh and retry.",
        "fixed-trade/open: persona risk vs request.",
      )
    }

    const unlockCtx = await buildUnlockContext(admin, user.id, { minPrincipalUsd: 100, minDaysActive: 30 })
    const gate = personaUnlocked(persona, unlockCtx)
    if (!gate.ok) {
      return jsonMutationError(
        403,
        "DESK_LOCKED",
        gate.reason ?? "This desk is locked for your account right now.",
        "fixed-trade/open: personaUnlocked gate.",
        { suggested_action: "Review unlock requirements or pick another desk." },
      )
    }

    const launch = await getPlatformLaunchStatus()
    const launchStarterDesk =
      launchPromotionsActive(launch) &&
      Boolean(launch.programs.onboarding?.starter_fix_unlock) &&
      traderPersonaIdRaw === getLaunchStarterFixPersonaId(launch.programs)

    if (!traderEligibleForFixedTrade(userLevel, riskClass, { launchStarterDesk })) {
      return jsonMutationError(
        403,
        "TIER_DESK_NOT_ALLOWED",
        "Your account tier cannot open fixed trades with this desk risk class.",
        "fixed-trade/open: traderEligibleForFixedTrade false.",
        { suggested_action: "Choose a lower-risk desk or upgrade when eligible." },
      )
    }

    const fees = fixInsuranceAndWithdrawFees(userLevel, riskClass)
    const { grossCommitUsd: grossUsd, insuranceFeeUsd, principalUsd } = splitFixedTradeOpenCommitUsd(
      grossCommitUsd,
      fees.insuranceFeeRate,
    )
    if (!(principalUsd > 0)) {
      return jsonMutationError(
        400,
        "INVALID_PRINCIPAL",
        "Allocation is too small after insurance is reserved from your commitment.",
        "fixed-trade/open: net principal non-positive.",
      )
    }
    const minP = assertFixPrincipalUsd(principalUsd)
    if (!minP.ok) {
      return jsonMutationError(
        400,
        "PRINCIPAL_POLICY",
        minP.message,
        "fixed-trade/open: assertFixPrincipalUsd failed.",
      )
    }

    const debited = await casOpenFixedTradeDebit(admin, user.id, grossUsd, principalUsd)
    if (!debited.ok) {
      return jsonMutationError(
        400,
        "INSUFFICIENT_NEXUS_MAIN",
        "Nexus Main does not have enough available balance for this allocation. Retail and other buckets cannot be used here.",
        "fixed-trade/open: casOpenFixedTradeDebit failed.",
        {
          suggested_action: "Add funds to Nexus Main or reduce the allocation size.",
          required: debited.required,
          available_balance: debited.available_balance,
        },
      )
    }
    const nextAvailable = debited.available_balance
    const nextStake = debited.current_stake

    const seedKey =
      body.seedKey?.trim() ||
      `${user.id}-${persona.id}-${grossUsd}-${fixPeriodMonths}-${Date.now()}`

    const display = await resolveFixedTradeMarketLock(seedKey)

    const { data: sessionRow, error: sErr } = await admin
      .from("fixed_trade_sessions")
      .insert({
        user_id: user.id,
        principal_amount: roundUsd2(principalUsd),
        insurance_fee_amount: roundUsd2(insuranceFeeUsd),
        risk_class: riskClass,
        fix_period_months: fixPeriodMonths,
        status: "active",
        trader_persona_id: persona.id,
        seed_key: seedKey,
        metadata: {
          v: 2,
          gross_commit_usd: grossUsd,
          coin_symbol: display.coinSymbol,
          fixed_price_usd: display.fixedPriceUsd,
          price_provider: display.provider,
          live_at_open: display.liveAtOpen,
        },
      })
      .select("id,created_at,seed_key")
      .single()

    if (sErr) throw new Error(sErr.message)

    const sessionId = sessionRow?.id as string

    if (insuranceFeeUsd > 0) {
      const tr = await treasury.mutateTreasury(
        "CREDIT",
        insuranceFeeUsd,
        `fixed_trade_insurance:${sessionId}`,
        `Fixed-trade insurance ${(fees.insuranceFeeRate * 100).toFixed(2)}% carved from open commit`,
        user.id,
        "MAIN_TREASURY",
      )
      if (!tr.success) {
        console.error("[fixed-trade/open] treasury insurance credit failed:", tr.error, sessionId)
      }
    }
    const createdAtIso = sessionRow?.created_at as string
    const resolvedSeed = (sessionRow?.seed_key as string | null)?.trim() || seedKey
    const leaseEnd = officialLeaseEndDate(createdAtIso, fixPeriodMonths)

    const lifecycle = buildFixedTradeLifecycleV2(
      roundUsd2(principalUsd),
      fixPeriodMonths,
      sessionId,
      user.id,
    )
    const { error: lifeErr } = await admin
      .from("fixed_trade_sessions")
      .update({
        metadata: {
          v: 2,
          gross_commit_usd: grossUsd,
          coin_symbol: display.coinSymbol,
          fixed_price_usd: display.fixedPriceUsd,
          price_provider: display.provider,
          live_at_open: display.liveAtOpen,
          lifecycle,
        },
      })
      .eq("id", sessionId)
    if (lifeErr) {
      console.error("[fixed-trade/open] lifecycle metadata update failed", lifeErr)
    }

    await recordFinancialEvent({
      userId: user.id,
      eventType: "fixed_trade_insurance_fee",
      category: "trade",
      amount: insuranceFeeUsd,
      feeAmount: 0,
      balanceSource: "fixed_trade_gross_commit",
      balanceDestination: "MAIN_TREASURY",
      status: "completed",
      relatedTradeId: sessionId,
      actorType: "user",
      actorId: user.id,
      summary: `Insurance (${(fees.insuranceFeeRate * 100).toFixed(2)}%) carved from allocation and credited to treasury.`,
      metadata: {
        grossCommitUsd: grossUsd,
        principalUsd,
        withdrawalFeeRateDeclared: fees.withdrawalFeeRate,
        fixPeriodMonths,
        riskClass,
      },
    })

    await recordFinancialEvent({
      userId: user.id,
      eventType: "fixed_trade_principal_lock",
      category: "trade",
      amount: principalUsd,
      feeAmount: 0,
      balanceSource: "fixed_trade_gross_commit",
      balanceDestination: "current_stake",
      status: "completed",
      relatedTradeId: sessionId,
      actorType: "user",
      actorId: user.id,
      summary: "Net principal locked into active fixed session (insurance carved from gross commit).",
      metadata: { grossCommitUsd: grossUsd, insuranceFeeUsd, fixPeriodMonths, riskClass },
    })

    return NextResponse.json({
      success: true,
      ok: true,
      sessionId,
      seedKey: resolvedSeed,
      createdAt: createdAtIso,
      leaseEndAt: leaseEnd.toISOString(),
      coinSymbol: display.coinSymbol,
      fixedPriceUsd: display.fixedPriceUsd,
      grossCommitUsd: grossUsd,
      principalUsd: roundUsd2(principalUsd),
      fees: {
        insuranceFeeUsd: roundUsd2(insuranceFeeUsd),
        insuranceFeeRate: fees.insuranceFeeRate,
        declaredWithdrawalFeeRate: fees.withdrawalFeeRate,
      },
      balances: {
        available_balance: round2(nextAvailable),
        current_stake: round2(nextStake),
      },
    })
  } catch (e) {
    console.error("[fixed-trade/open]", e)
    return jsonMutationError(
      500,
      "INTERNAL_ERROR",
      "Fixed trade could not open. Retry or contact support.",
      e instanceof Error ? e.message : "unknown",
    )
  }
}
