import { NextResponse } from "next/server"
import { bearerUserWithGovernance } from "@/lib/server/account-governance"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { minWithdrawUsdFloor } from "@/lib/nexus-fx"
import { roundUsd2 } from "@/lib/nexus-financial-policy"

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

const WINDOW_MS = 86_400_000

export async function GET(request: Request) {
  try {
    const auth = await bearerUserWithGovernance(request, "read")
    if ("response" in auth) return auth.response
    const { user } = auth
    const admin = createAdminClient()

    const { data: row, error: selErr } = await admin
      .from("user_balances")
      .select("available_balance, withdrawal_pending_balance")
      .eq("user_id", user.id)
      .maybeSingle()
    if (selErr) throw new Error(selErr.message)

    const available = round2(Number(row?.available_balance ?? 0))
    const pending = round2(Number((row as Record<string, unknown>)?.withdrawal_pending_balance ?? 0))
    const total = round2(available + pending)
    const minUsd = roundUsd2(minWithdrawUsdFloor())
    const maxUsd = roundUsd2(Math.min(available, Math.max(0, total * 0.5)))

    const since = new Date(Date.now() - WINDOW_MS).toISOString()
    const { data: recent, error: wErr } = await admin
      .from("withdrawal_requests")
      .select("id,created_at")
      .eq("user_id", user.id)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (wErr) throw new Error(wErr.message)

    const lastAt = recent?.created_at ? new Date(recent.created_at as string).getTime() : null
    const nextEligibleAt =
      lastAt !== null ? new Date(lastAt + WINDOW_MS).toISOString() : null
    const cooldownActive = lastAt !== null && Date.now() - lastAt < WINDOW_MS
    const msRemaining =
      lastAt !== null && cooldownActive ? Math.max(0, lastAt + WINDOW_MS - Date.now()) : 0

    return NextResponse.json({
      minUsd,
      maxUsd,
      availableUsd: available,
      totalBalanceUsd: total,
      cooldownActive,
      nextEligibleAt,
      msRemaining,
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Internal error" }, { status: 500 })
  }
}
