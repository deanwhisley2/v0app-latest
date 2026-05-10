import { NextResponse } from "next/server"
import { bearerUserWithGovernance } from "@/lib/server/account-governance"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { recordFinancialEvent } from "@/lib/server/financial-events"
import { traderEligibleForFixedTrade } from "@/lib/fix-trade-access"
import type { FixTradeRiskLevel } from "@/lib/fix-trade-access"
import {
  computeFixedTradeMainDebitUsd,
  computeInsuranceFeeUsd,
  fixInsuranceAndWithdrawFees,
  roundUsd2,
} from "@/lib/nexus-financial-policy"

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function mapProfileToFixUserLevel(tradingUserLevel: number): number {
  if (tradingUserLevel === 5) return 5
  if (tradingUserLevel === 2) return 2
  return 1
}

export async function POST(request: Request) {
  try {
    const auth = await bearerUserWithGovernance(request, "mutate")
    if ("response" in auth) return auth.response
    const { user } = auth

    const body = (await request.json().catch(() => ({}))) as {
      principalUsd?: number
      riskClass?: FixTradeRiskLevel
      fixPeriodMonths?: 1 | 3 | 6
      traderPersonaId?: string
      seedKey?: string
    }

    const principalUsd = Number(body.principalUsd ?? 0)
    const riskClass = body.riskClass
    const fixPeriodMonths = body.fixPeriodMonths

    if (!Number.isFinite(principalUsd) || principalUsd <= 0) {
      return NextResponse.json({ error: "principalUsd must be > 0" }, { status: 400 })
    }
    if (riskClass !== "Low" && riskClass !== "Medium" && riskClass !== "High") {
      return NextResponse.json({ error: "invalid riskClass" }, { status: 400 })
    }
    if (fixPeriodMonths !== 1 && fixPeriodMonths !== 3 && fixPeriodMonths !== 6) {
      return NextResponse.json({ error: "fixPeriodMonths must be 1, 3, or 6" }, { status: 400 })
    }

    const admin = createAdminClient()
    const { data: profile, error: pErr } = await admin
      .from("profiles")
      .select("trading_user_level")
      .eq("id", user.id)
      .maybeSingle()
    if (pErr) throw new Error(pErr.message)

    const tradingLv = Number(profile?.trading_user_level ?? 1)
    const userLevel = mapProfileToFixUserLevel(tradingLv)

    if (!traderEligibleForFixedTrade(userLevel, riskClass)) {
      return NextResponse.json(
        {
          error:
            "Your level cannot open fixed trades with this trader risk tier. Upgrade or pick a lower-risk desk.",
        },
        { status: 403 }
      )
    }

    const fees = fixInsuranceAndWithdrawFees(userLevel, riskClass)
    const insuranceFeeUsd = computeInsuranceFeeUsd(principalUsd, fees.insuranceFeeRate)
    const totalDebit = computeFixedTradeMainDebitUsd(principalUsd, insuranceFeeUsd)

    const { data: row, error: bErr } = await admin
      .from("user_balances")
      .select("available_balance, current_stake")
      .eq("user_id", user.id)
      .maybeSingle()
    if (bErr) throw new Error(bErr.message)

    const available = round2(Number(row?.available_balance ?? 0))
    if (totalDebit > available) {
      return NextResponse.json(
        {
          error: "Insufficient Nexus Main balance — cannot fund principal plus insurance.",
          required: totalDebit,
          available_balance: available,
        },
        { status: 400 }
      )
    }

    const stakeWas = round2(Number(row?.current_stake ?? 0))
    const nextAvailable = round2(available - totalDebit)
    const nextStake = round2(stakeWas + principalUsd)

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

    const seedKey =
      body.seedKey?.trim() ||
      `${user.id}-${body.traderPersonaId ?? "desk"}-${principalUsd}-${fixPeriodMonths}-${Date.now()}`

    const { data: sessionRow, error: sErr } = await admin
      .from("fixed_trade_sessions")
      .insert({
        user_id: user.id,
        principal_amount: roundUsd2(principalUsd),
        insurance_fee_amount: roundUsd2(insuranceFeeUsd),
        risk_class: riskClass,
        fix_period_months: fixPeriodMonths,
        status: "active",
        trader_persona_id: body.traderPersonaId ?? null,
        seed_key: seedKey,
      })
      .select("id,created_at")
      .single()

    if (sErr) throw new Error(sErr.message)

    const sessionId = sessionRow?.id as string

    await recordFinancialEvent({
      userId: user.id,
      eventType: "fixed_trade_insurance_fee",
      category: "trade",
      amount: insuranceFeeUsd,
      feeAmount: 0,
      balanceSource: "available_balance",
      balanceDestination: "platform_insurance",
      status: "completed",
      relatedTradeId: sessionId,
      actorType: "user",
      actorId: user.id,
      summary: `Insurance fee (${(fees.insuranceFeeRate * 100).toFixed(2)}%) deducted at fixed-trade open.`,
      metadata: {
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
      balanceSource: "available_balance",
      balanceDestination: "current_stake",
      status: "completed",
      relatedTradeId: sessionId,
      actorType: "user",
      actorId: user.id,
      summary: "Principal locked into active fixed session from Nexus Main.",
      metadata: { fixPeriodMonths, riskClass },
    })

    return NextResponse.json({
      ok: true,
      sessionId,
      seedKey,
      fees: {
        insuranceFeeUsd: roundUsd2(insuranceFeeUsd),
        declaredWithdrawalFeeRate: fees.withdrawalFeeRate,
      },
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
