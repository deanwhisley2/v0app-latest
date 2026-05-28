import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { bearerUserWithGovernance } from "@/lib/server/account-governance"
import { recordFinancialEvent } from "@/lib/server/financial-events"

type ActionBody = {
  action?: "extract" | "transfer_to_main"
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
    if (action !== "extract" && action !== "transfer_to_main") {
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
        summary: "Fixed trade earnings credited to container balance.",
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

    // transfer_to_main
    if (withdrawable <= 0) {
      return NextResponse.json({ error: "No container liquid earnings to transfer" }, { status: 400 })
    }
    const transferAmount = withdrawable
    const nextAvailable = round2(available + transferAmount)
    const nextWithdrawable = 0

    const { error: updateErr } = await admin
      .from("user_balances")
      .update({
        available_balance: nextAvailable,
        container_withdrawable_earnings: nextWithdrawable,
        last_updated: new Date().toISOString(),
      })
      .eq("user_id", user.id)
    if (updateErr) throw new Error(updateErr.message)

    await recordFinancialEvent({
      userId: user.id,
      eventType: "withdrawable_to_main",
      category: "internal_transfer",
      amount: transferAmount,
      feeAmount: 0,
      balanceSource: "container_withdrawable_earnings",
      balanceDestination: "available_balance",
      status: "completed",
      actorType: "user",
      actorId: user.id,
      summary: "Fixed trade earnings credited to Nexus main balance.",
    })

    return NextResponse.json({
      ok: true,
      action,
      transferAmount,
      balances: {
        available_balance: nextAvailable,
        active_container_earnings: active,
        container_withdrawable_earnings: nextWithdrawable,
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
