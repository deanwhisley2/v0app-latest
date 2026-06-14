import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { bearerUserWithGovernance } from "@/lib/server/account-governance"
import { recordFinancialEvent } from "@/lib/server/financial-events"

type ActionBody = {
  action?: "extract" | "withdraw"
  grossAmount?: number
}

const CONTAINER_FEE_RATE = 0.01

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

async function readBalanceRow(admin: ReturnType<typeof createAdminClient>, userId: string) {
  const { data, error } = await admin
    .from("user_balances")
    .select(
      "id,user_id,available_balance,active_container_earnings,container_withdrawable_earnings,lifetime_container_withdrawn,lifetime_container_fees"
    )
    .eq("user_id", userId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data
}

export async function POST(request: Request) {
  try {
    const auth = await bearerUserWithGovernance(request, "mutate")
    if ("response" in auth) return auth.response
    const { user } = auth

    const body = (await request.json().catch(() => ({}))) as ActionBody
    const action = body.action
    if (action !== "extract" && action !== "withdraw") {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 })
    }

    const admin = createAdminClient()
    const current = await readBalanceRow(admin, user.id)
    if (!current) {
      return NextResponse.json({ error: "Balance row not found" }, { status: 404 })
    }

    const available = Number(current.available_balance ?? 0)
    const active = Number((current as Record<string, unknown>).active_container_earnings ?? 0)
    const withdrawable = Number((current as Record<string, unknown>).container_withdrawable_earnings ?? 0)
    const lifetimeWithdrawn = Number((current as Record<string, unknown>).lifetime_container_withdrawn ?? 0)
    const lifetimeFees = Number((current as Record<string, unknown>).lifetime_container_fees ?? 0)

    if (action === "extract") {
      const gross = Number(body.grossAmount ?? 0)
      if (!Number.isFinite(gross) || gross <= 0) {
        return NextResponse.json({ error: "grossAmount must be > 0" }, { status: 400 })
      }
      if (gross > active) {
        return NextResponse.json({ error: "Insufficient active container earnings" }, { status: 400 })
      }
      const fee = round2(gross * CONTAINER_FEE_RATE)
      const credited = round2(gross - fee)

      const nextActive = round2(active - gross)
      const nextWithdrawable = round2(withdrawable + credited)
      const nextLifetimeWithdrawn = round2(lifetimeWithdrawn + gross)
      const nextLifetimeFees = round2(lifetimeFees + fee)

      const { error: updateErr } = await admin
        .from("user_balances")
        .update({
          active_container_earnings: nextActive,
          container_withdrawable_earnings: nextWithdrawable,
          lifetime_container_withdrawn: nextLifetimeWithdrawn,
          lifetime_container_fees: nextLifetimeFees,
          last_updated: new Date().toISOString(),
        })
        .eq("user_id", user.id)
      if (updateErr) throw new Error(updateErr.message)

      await recordFinancialEvent({
        userId: user.id,
        eventType: "container_to_withdrawable",
        category: "container",
        amount: gross,
        feeAmount: fee,
        balanceSource: "active_container_earnings",
        balanceDestination: "container_withdrawable_earnings",
        status: "completed",
        actorType: "user",
        actorId: user.id,
        summary: "Fixed trade earnings credited to earnings balance.",
        metadata: { creditedAmount: credited, feeRate: CONTAINER_FEE_RATE },
      })

      return NextResponse.json({
        ok: true,
        action,
        feeRate: CONTAINER_FEE_RATE,
        grossAmount: gross,
        feeAmount: fee,
        creditedAmount: credited,
        balances: {
          available_balance: available,
          active_container_earnings: nextActive,
          container_withdrawable_earnings: nextWithdrawable,
        },
      })
    }

    // withdraw — Directly cash out earnings via the withdrawal pipeline
    if (withdrawable <= 0) {
      return NextResponse.json({ error: "No earnings balance to withdraw" }, { status: 400 })
    }
    if (withdrawable < 1) {
      return NextResponse.json({ error: "Minimum earnings withdrawal is $1.00" }, { status: 400 })
    }

    // Create a withdrawal request from earnings
    const { data: profile } = await admin
      .from("profiles")
      .select("funding_country_code")
      .eq("id", user.id)
      .maybeSingle()

    const grossAmount = withdrawable
    const txRef = crypto.randomUUID()

    // Record as a withdrawal request from earnings
    const { error: wrErr } = await admin
      .from("withdrawal_requests")
      .insert({
        user_id: user.id,
        amount: grossAmount,
        processing_fee_amount: 0,
        payout_amount: grossAmount,
        processing_fee_rate: 0,
        currency_context: "USD",
        status: "pending",
        transaction_ref: txRef,
        metadata: {
          source: "earnings_withdrawal",
          earnings_full_balance: true,
          settlement: {
            gross_usd: grossAmount,
            processing_fee_usd: 0,
            payout_usd: grossAmount,
            fee_rate: 0,
          },
        },
      })

    if (wrErr) throw new Error(wrErr.message)

    // Deduct from earnings
    await admin
      .from("user_balances")
      .update({
        container_withdrawable_earnings: 0,
        withdrawal_pending_balance: round2(Number(current.withdrawal_pending_balance ?? 0) + grossAmount),
        last_updated: new Date().toISOString(),
      })
      .eq("user_id", user.id)

    await recordFinancialEvent({
      userId: user.id,
      eventType: "earnings_withdrawal_request",
      category: "cashout",
      amount: grossAmount,
      feeAmount: 0,
      balanceSource: "container_withdrawable_earnings",
      balanceDestination: "withdrawal_pending_balance",
      status: "pending",
      transactionRef: txRef,
      actorType: "user",
      actorId: user.id,
      summary: `Earnings withdrawal requested: $${grossAmount}`,
      metadata: { source: "earnings_direct_withdrawal" },
    })

    return NextResponse.json({
      ok: true,
      action,
      withdrawalAmount: grossAmount,
      transactionRef: txRef,
      message: "Earnings withdrawal request submitted for admin review.",
      balances: {
        available_balance: available,
        active_container_earnings: active,
        container_withdrawable_earnings: 0,
        withdrawal_pending_balance: round2(Number(current.withdrawal_pending_balance ?? 0) + grossAmount),
      },
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Internal error" },
      { status: 500 }
    )
  }
}

export async function GET(request: Request) {
  try {
    const auth = await bearerUserWithGovernance(request, "read")
    if ("response" in auth) return auth.response
    const { user } = auth
    const admin = createAdminClient()
    const { data, error } = await admin
      .from("container_balance_events")
      .select("id,event_type,gross_amount,fee_amount,net_amount,created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20)
    if (error) throw new Error(error.message)
    return NextResponse.json({ events: data ?? [] })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Internal error" },
      { status: 500 }
    )
  }
}
