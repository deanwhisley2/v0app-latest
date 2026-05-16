import { NextResponse } from "next/server"
import { bearerUserWithGovernance } from "@/lib/server/account-governance"
import { computeAccountLiquidWithdrawBaseUsd } from "@/lib/server/account-liquid-withdraw-base"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { recordFinancialEvent } from "@/lib/server/financial-events"
import { formatLocalFiatAmount, isSupportedFiat } from "@/lib/currency-display"
import { minWithdrawUsdOk, minWithdrawUsdFloor, usdToLocalUnits } from "@/lib/nexus-fx"
import { roundUsd2 } from "@/lib/nexus-financial-policy"
import {
  assertWithdrawalSettlementConserved,
  computeWithdrawalProcessingSettlement,
} from "@/lib/server/withdrawal-processing-fee"

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export async function POST(request: Request) {
  try {
    const auth = await bearerUserWithGovernance(request, "mutate")
    if ("response" in auth) return auth.response
    const { user } = auth

    const body = (await request.json().catch(() => ({}))) as {
      amount?: number
      currencyContext?: string
      /** Shown on L5 withdrawal desk (payout rail / destination hint — no PII required). */
      payoutRail?: string
      destinationHint?: string
    }
    const amount = Number(body.amount ?? 0)
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "Amount must be greater than 0" }, { status: 400 })
    }

    let settlement
    try {
      settlement = computeWithdrawalProcessingSettlement(amount)
      assertWithdrawalSettlementConserved(settlement)
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Invalid withdrawal amount." },
        { status: 400 },
      )
    }
    const grossAmount = settlement.grossAmount

    const minFloor = roundUsd2(minWithdrawUsdFloor())
    if (!minWithdrawUsdOk(grossAmount)) {
      const ccyRaw = String(body.currencyContext ?? "").trim().toUpperCase()
      const ccy = isSupportedFiat(ccyRaw) ? ccyRaw : "USD"
      const local = usdToLocalUnits(minFloor, ccy)
      const minLabel =
        local != null && Number.isFinite(local)
          ? formatLocalFiatAmount(local, ccy, "en-US")
          : `$${minFloor.toFixed(2)}`
      return NextResponse.json(
        {
          error: `Minimum withdrawal is ${minLabel}.`,
        },
        { status: 400 }
      )
    }

    const admin = createAdminClient()
    const since = new Date(Date.now() - 86_400_000).toISOString()
    const { data: recentW, error: wqErr } = await admin
      .from("withdrawal_requests")
      .select("id,created_at")
      .eq("user_id", user.id)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (wqErr) throw new Error(wqErr.message)
    if (recentW?.created_at) {
      const last = new Date(recentW.created_at as string).getTime()
      const next = new Date(last + 86_400_000).toISOString()
      return NextResponse.json(
        {
          error: `Withdrawal limit: one per 24 hours. Next window: ${next}.`,
          nextEligibleAt: next,
        },
        { status: 429 }
      )
    }

    const liquid = await computeAccountLiquidWithdrawBaseUsd(admin, user.id)
    const available = liquid.availableUsd
    const totalBalance = liquid.totalLiquidUsd
    const maxAllowed = round2(Math.min(available, totalBalance * 0.5))

    const { data: row, error: selErr } = await admin
      .from("user_balances")
      .select("available_balance, withdrawal_pending_balance")
      .eq("user_id", user.id)
      .maybeSingle()

    if (selErr) throw new Error(selErr.message)

    const pendingWas = round2(Number((row as Record<string, unknown>)?.withdrawal_pending_balance ?? 0))

    if (grossAmount > maxAllowed + 1e-6) {
      return NextResponse.json(
        {
          error: `For security, each withdrawal is capped at 50% of your total balance (about ${roundUsd2(maxAllowed)} USD right now).`,
          maxUsd: maxAllowed,
          totalBalanceUsd: totalBalance,
        },
        { status: 400 }
      )
    }

    if (grossAmount > available) {
      return NextResponse.json(
        { error: "Insufficient Nexus Main balance for this withdrawal." },
        { status: 400 }
      )
    }

    const nextAvailable = round2(available - grossAmount)
    const nextPending = round2(pendingWas + grossAmount)

    const { error: upErr } = await admin
      .from("user_balances")
      .upsert(
        {
          user_id: user.id,
          available_balance: nextAvailable,
          withdrawal_pending_balance: nextPending,
          last_updated: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      )
    if (upErr) throw new Error(upErr.message)

    const txRef = crypto.randomUUID()

    const rail =
      typeof body.payoutRail === "string" ? body.payoutRail.trim().slice(0, 64) || null : null
    const destHint =
      typeof body.destinationHint === "string" ? body.destinationHint.trim().slice(0, 200) || null : null

    const { data: ins, error: wrErr } = await admin
      .from("withdrawal_requests")
      .insert({
        user_id: user.id,
        amount: grossAmount,
        processing_fee_amount: settlement.processingFeeAmount,
        payout_amount: settlement.payoutAmount,
        processing_fee_rate: settlement.processingFeeRate,
        currency_context: (body.currencyContext ?? "USD").slice(0, 12),
        status: "pending",
        transaction_ref: txRef,
        metadata: {
          source: "user_withdrawal_request",
          settlement: {
            gross_usd: settlement.grossAmount,
            processing_fee_usd: settlement.processingFeeAmount,
            payout_usd: settlement.payoutAmount,
            fee_rate: settlement.processingFeeRate,
          },
          ...(rail ? { payout_rail: rail } : {}),
          ...(destHint ? { destination_hint: destHint } : {}),
        },
      })
      .select("id,created_at,transaction_ref")
      .single()

    if (wrErr) throw new Error(wrErr.message)

    await recordFinancialEvent({
      userId: user.id,
      eventType: "withdrawal_pending",
      category: "cashout",
      amount: grossAmount,
      feeAmount: settlement.processingFeeAmount,
      balanceSource: "available_balance",
      balanceDestination: "withdrawal_pending_balance",
      status: "pending",
      transactionRef: txRef,
      actorType: "user",
      actorId: user.id,
      summary: "Withdrawal submitted.",
      metadata: {
        requestId: ins?.id,
        settlement: {
          gross_usd: settlement.grossAmount,
          processing_fee_usd: settlement.processingFeeAmount,
          payout_usd: settlement.payoutAmount,
        },
      },
    })

    return NextResponse.json({
      ok: true,
      requestId: ins?.id,
      transactionRef: ins?.transaction_ref,
      balances: {
        available_balance: nextAvailable,
        withdrawal_pending_balance: nextPending,
      },
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Internal error" },
      { status: 500 }
    )
  }
}
