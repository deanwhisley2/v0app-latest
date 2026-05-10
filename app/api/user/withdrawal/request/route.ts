import { NextResponse } from "next/server"
import { bearerUserWithGovernance } from "@/lib/server/account-governance"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { recordFinancialEvent } from "@/lib/server/financial-events"
import { minWithdrawUsdOk } from "@/lib/nexus-fx"
import { roundUsd2 } from "@/lib/nexus-financial-policy"

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
    }
    const amount = Number(body.amount ?? 0)
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "Amount must be greater than 0" }, { status: 400 })
    }

    if (!minWithdrawUsdOk(amount)) {
      return NextResponse.json(
        { error: `Minimum withdrawal is ${roundUsd2(3)} USD (normalized internal unit).` },
        { status: 400 }
      )
    }

    const admin = createAdminClient()
    const { data: row, error: selErr } = await admin
      .from("user_balances")
      .select("available_balance, withdrawal_pending_balance")
      .eq("user_id", user.id)
      .maybeSingle()

    if (selErr) throw new Error(selErr.message)

    const available = round2(Number(row?.available_balance ?? 0))
    const pendingWas = round2(Number((row as Record<string, unknown>)?.withdrawal_pending_balance ?? 0))

    if (amount > available) {
      return NextResponse.json(
        { error: "Insufficient Nexus Main balance for this withdrawal." },
        { status: 400 }
      )
    }

    const nextAvailable = round2(available - amount)
    const nextPending = round2(pendingWas + amount)

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

    const { data: ins, error: wrErr } = await admin
      .from("withdrawal_requests")
      .insert({
        user_id: user.id,
        amount,
        currency_context: (body.currencyContext ?? "USD").slice(0, 12),
        status: "pending",
        transaction_ref: txRef,
        metadata: { source: "user_withdrawal_request" },
      })
      .select("id,created_at,transaction_ref")
      .single()

    if (wrErr) throw new Error(wrErr.message)

    await recordFinancialEvent({
      userId: user.id,
      eventType: "withdrawal_pending",
      category: "cashout",
      amount,
      feeAmount: 0,
      balanceSource: "available_balance",
      balanceDestination: "withdrawal_pending_balance",
      status: "pending",
      transactionRef: txRef,
      actorType: "user",
      actorId: user.id,
      summary: "Withdrawal initiated — Nexus Main debited; funds frozen pending Level 5 review.",
      metadata: { requestId: ins?.id },
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
