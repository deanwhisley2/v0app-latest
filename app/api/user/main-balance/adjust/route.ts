import { NextResponse } from "next/server"
import { bearerUserWithGovernance } from "@/lib/server/account-governance"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { recordFinancialEvent } from "@/lib/server/financial-events"

type Body = {
  action?: "credit" | "debit"
  amount?: number
  reason?: string
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export async function POST(request: Request) {
  try {
    const auth = await bearerUserWithGovernance(request, "mutate")
    if ("response" in auth) return auth.response
    const { user } = auth

    const body = (await request.json().catch(() => ({}))) as Body
    if (body.action !== "credit" && body.action !== "debit") {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 })
    }
    const amount = Number(body.amount ?? 0)
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "Amount must be greater than 0" }, { status: 400 })
    }

    const admin = createAdminClient()
    const { data: row, error: selectErr } = await admin
      .from("user_balances")
      .select("available_balance")
      .eq("user_id", user.id)
      .maybeSingle()
    if (selectErr) throw new Error(selectErr.message)
    const current = Number(row?.available_balance ?? 0)
    const next =
      body.action === "credit" ? round2(current + amount) : round2(current - amount)
    if (next < 0) {
      return NextResponse.json({ error: "Insufficient main balance" }, { status: 400 })
    }

    const { error: upsertErr } = await admin.from("user_balances").upsert(
      {
        user_id: user.id,
        available_balance: next,
        last_updated: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    )
    if (upsertErr) throw new Error(upsertErr.message)

    await recordFinancialEvent({
      userId: user.id,
      eventType: body.action === "credit" ? "nexus_balance_credit" : "nexus_balance_deduction",
      category: body.action === "credit" ? "funding" : "cashout",
      amount,
      balanceSource: body.action === "credit" ? "external_funding" : "available_balance",
      balanceDestination: body.action === "credit" ? "available_balance" : "withdrawal_request",
      status: "completed",
      actorType: "user",
      actorId: user.id,
      summary:
        body.reason?.trim() ||
        (body.action === "credit"
          ? "Main account funded."
          : "Main account withdrawal deduction."),
    })

    return NextResponse.json({ ok: true, available_balance: next })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Internal error" },
      { status: 500 }
    )
  }
}
