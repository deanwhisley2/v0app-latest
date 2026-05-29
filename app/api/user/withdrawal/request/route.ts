import { NextResponse } from "next/server"
import { bearerUserWithGovernance } from "@/lib/server/account-governance"
import { computeAccountLiquidWithdrawBaseUsd } from "@/lib/server/account-liquid-withdraw-base"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { recordFinancialEvent } from "@/lib/server/financial-events"
import { isSupportedFiat } from "@/lib/currency-display"
import { resolveCustomerExperience } from "@/lib/congo-customer-experience"
import { customerNotifyT } from "@/lib/server/customer-ui-language"
import { appendUserAccountNotification } from "@/lib/server/user-account-notifications"
import { formatCustomerMoneyForUser } from "@/lib/server/customer-money-copy"
import { minWithdrawUsdOk, minWithdrawUsdFloor } from "@/lib/nexus-fx"
import { roundUsd2 } from "@/lib/nexus-financial-policy"
import {
  WITHDRAWAL_COOLDOWN_MS,
  mainMinimumRetainUsd,
  withdrawalCooldownError,
} from "@/lib/server/withdrawal-policy"
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
      /** Exact local units the user typed (approval intent; ledger uses `amount` USD). */
      amountInputLocal?: number
      inputCurrency?: string
      /** Registered payout from security profile — no manual entry. */
      payoutOptionId?:
        | "deposit_line"
        | "withdrawal_line"
        | "mtn_deposit"
        | "airtel_deposit"
        | "mtn_withdrawal"
        | "airtel_withdrawal"
        | "crypto"
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

    const admin = createAdminClient()

    const minFloor = roundUsd2(minWithdrawUsdFloor())
    if (!minWithdrawUsdOk(grossAmount)) {
      const minLabel = await formatCustomerMoneyForUser(admin, user.id, minFloor)
      return NextResponse.json(
        {
          error: `Minimum withdrawal is ${minLabel}.`,
        },
        { status: 400 },
      )
    }
    const since = new Date(Date.now() - WITHDRAWAL_COOLDOWN_MS).toISOString()
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
      const next = new Date(last + WITHDRAWAL_COOLDOWN_MS).toISOString()
      return NextResponse.json(
        {
          error: withdrawalCooldownError(next),
          nextEligibleAt: next,
        },
        { status: 429 }
      )
    }

    const { data: profileRow } = await admin
      .from("profiles")
      .select("funding_country_code,startup_bonus_received_at,startup_capital_locked_usd,startup_capital_granted_at")
      .eq("id", user.id)
      .maybeSingle()

    const liquid = await computeAccountLiquidWithdrawBaseUsd(admin, user.id)
    const available = liquid.availableUsd
    const totalBalance = liquid.totalLiquidUsd
    const mainRetainUsd = mainMinimumRetainUsd(profileRow)
    const withdrawableMainUsd = round2(Math.max(0, available - mainRetainUsd))
    const maxAllowed = withdrawableMainUsd

    const { data: row, error: selErr } = await admin
      .from("user_balances")
      .select("available_balance, withdrawal_pending_balance")
      .eq("user_id", user.id)
      .maybeSingle()

    if (selErr) throw new Error(selErr.message)

    const pendingWas = round2(Number((row as Record<string, unknown>)?.withdrawal_pending_balance ?? 0))

    if (grossAmount > maxAllowed + 1e-6) {
      const maxFmt = await formatCustomerMoneyForUser(admin, user.id, maxAllowed)
      return NextResponse.json(
        {
          error: `Withdrawal amount exceeds your withdrawable Nexus Main balance (about ${maxFmt}).`,
          maxUsd: maxAllowed,
          totalBalanceUsd: totalBalance,
        },
        { status: 400 },
      )
    }

    if (grossAmount > withdrawableMainUsd + 1e-6 || grossAmount > available + 1e-6) {
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

    const { getOrCreateSecurityProfile, assertNotInCooldown } = await import(
      "@/lib/server/user-security-profile-service"
    )
    const { maskSensitiveValue } = await import("@/lib/nexus-security-code")
    const secRow = await getOrCreateSecurityProfile(admin, user.id)
    if (!secRow.security_code_hash) {
      return NextResponse.json(
        { error: "Set your Nexus Security Code in Settings before withdrawing." },
        { status: 403 },
      )
    }
    try {
      assertNotInCooldown(secRow)
    } catch (coolErr) {
      return NextResponse.json(
        { error: coolErr instanceof Error ? coolErr.message : "Payout details in review." },
        { status: 409 },
      )
    }

    const { enrichRowWithdrawalMirrors } = await import("@/lib/server/user-security-profile-service")
    const { hasMinimumSecurity } = await import("@/lib/nexus-security-minimum")
    const payoutRow = enrichRowWithdrawalMirrors(secRow)
    if (!hasMinimumSecurity(payoutRow)) {
      return NextResponse.json(
        {
          error:
            "Set your 6-digit Nexus Security PIN and register at least one mobile money number with account holder name(s) before withdrawing.",
        },
        { status: 403 },
      )
    }

    const optionId = body.payoutOptionId
    let rail = "mobile_money"
    let destPlain: string | null = null
    let accountNames: string | null = null
    let payoutNetwork: string | null = null
    if (optionId === "crypto") {
      if (!secRow.crypto_wallet) {
        return NextResponse.json({ error: "No crypto wallet on file." }, { status: 400 })
      }
      rail = "USDT_TRC20"
      destPlain = secRow.crypto_wallet
    } else if (
      optionId === "deposit_line" ||
      optionId === "withdrawal_line" ||
      optionId === "mtn_deposit" ||
      optionId === "airtel_deposit" ||
      optionId === "mtn_withdrawal" ||
      optionId === "airtel_withdrawal"
    ) {
      const { resolvePayerFromSecurityRow } = await import("@/lib/server/user-security-profile-service")
      const line = resolvePayerFromSecurityRow(payoutRow, optionId)
      if (!line.phone || !line.name) {
        return NextResponse.json({ error: "Selected payout line is not fully registered." }, { status: 400 })
      }
      payoutNetwork = line.network
      destPlain = line.phone
      accountNames = line.name
      rail =
        optionId === "withdrawal_line" || optionId.includes("withdrawal")
          ? `mobile_money_${(line.network ?? "unknown").toLowerCase()}_withdrawal`
          : `mobile_money_${(line.network ?? "unknown").toLowerCase()}_deposit`
    } else if (secRow.payout_method === "crypto_trc20" && secRow.crypto_wallet) {
      rail = "USDT_TRC20"
      destPlain = secRow.crypto_wallet
    } else if (secRow.withdrawal_number) {
      rail = "mobile_money_withdrawal"
      destPlain = secRow.withdrawal_number
      accountNames = secRow.withdrawal_account_names
    } else if (secRow.deposit_number) {
      rail = "mobile_money_deposit"
      destPlain = secRow.deposit_number
      accountNames = secRow.deposit_account_names
    } else {
      return NextResponse.json({ error: "Select a registered payout method." }, { status: 400 })
    }

    const destHint =
      destPlain && rail === "USDT_TRC20"
        ? maskSensitiveValue(destPlain, "wallet")
        : destPlain
          ? maskSensitiveValue(destPlain, "phone")
          : null

    const rawLocal = body.amountInputLocal != null ? Number(body.amountInputLocal) : NaN
    const inputCurRaw =
      typeof body.inputCurrency === "string" ? body.inputCurrency.trim().toUpperCase().slice(0, 12) : ""
    const amountInputLocal =
      Number.isFinite(rawLocal) && rawLocal > 0 && isSupportedFiat(inputCurRaw) ? rawLocal : null
    const inputCurrency = amountInputLocal != null ? inputCurRaw : null
    const localCashPayout =
      amountInputLocal != null &&
      inputCurrency &&
      settlement.grossAmount > 0 &&
      settlement.payoutAmount > 0
        ? {
            amount: round2(amountInputLocal * (settlement.payoutAmount / settlement.grossAmount)),
            currency: inputCurrency,
          }
        : null

    const { data: ins, error: wrErr } = await admin
      .from("withdrawal_requests")
      .insert({
        user_id: user.id,
        amount: grossAmount,
        processing_fee_amount: settlement.processingFeeAmount,
        payout_amount: settlement.payoutAmount,
        processing_fee_rate: settlement.processingFeeRate,
        currency_context: (body.currencyContext ?? "USD").slice(0, 12),
        amount_input_local: amountInputLocal,
        input_currency: inputCurrency,
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
          ...(amountInputLocal != null && inputCurrency
            ? {
                request_intent: {
                  amount_input_local: amountInputLocal,
                  input_currency: inputCurrency,
                },
                ...(localCashPayout ? { local_cash_payout: localCashPayout } : {}),
              }
            : {}),
          payout_method: secRow.payout_method,
          payout_option_id: optionId ?? null,
          ...(payoutNetwork ? { payout_network: payoutNetwork } : {}),
          ...(optionId
            ? {
                payout_option_label:
                  optionId === "mtn_withdrawal"
                    ? "MTN — withdrawals"
                    : optionId === "airtel_withdrawal"
                      ? "Airtel — withdrawals"
                      : optionId === "mtn_deposit"
                        ? "MTN — deposits"
                        : optionId === "airtel_deposit"
                          ? "Airtel — deposits"
                          : optionId === "withdrawal_line"
                            ? "Mobile money (withdrawal)"
                            : optionId === "deposit_line"
                              ? "Mobile money (deposit)"
                              : optionId === "crypto"
                                ? "USDT TRC20"
                                : optionId,
              }
            : {}),
          ...(rail ? { payout_rail: rail } : {}),
          ...(destHint ? { destination_hint: destHint } : {}),
          ...(accountNames ? { registered_account_names: accountNames } : {}),
          security_profile_snapshot: {
            payout_method: secRow.payout_method,
            payout_option_id: optionId ?? null,
            payout_network: payoutNetwork,
            destination_masked: destHint,
            registered_account_names: accountNames,
            payout_rail: rail,
          },
        },
      })
      .select("id,created_at,transaction_ref")
      .single()

    if (wrErr) throw new Error(wrErr.message)

    const exp = await resolveCustomerExperience(admin, user.id)
    const t = customerNotifyT(exp.language)
    const amountFmt = await formatCustomerMoneyForUser(admin, user.id, grossAmount)
    await appendUserAccountNotification(admin, {
      userId: user.id,
      sourceKind: "withdrawal_request",
      sourceId: String(ins?.id ?? txRef),
      notificationType: "withdrawal",
      title: t("notifications.withdrawal.submittedTitle"),
      body: t("notifications.withdrawal.submittedBody").replace("{{amount}}", amountFmt),
      nav: { kind: "wallet" },
      metadata: { amount_usd: grossAmount, requestId: ins?.id, transactionRef: txRef },
    })

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
