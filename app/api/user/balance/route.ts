import { NextResponse } from "next/server"
import { externalApisBlockedResponse } from "@/lib/dev-local-api-guard"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { getUserFromBearer } from "@/lib/auth-api"

export async function GET(request: Request) {
  const blocked = externalApisBlockedResponse()
  if (blocked) return blocked
  try {
    const user = await getUserFromBearer(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const admin = createAdminClient()
    const { data, error } = await admin
      .from("user_balances")
      .select(
        "total_earnings, current_stake, available_balance, withdrawal_pending_balance, active_container_earnings, container_withdrawable_earnings, lifetime_container_withdrawn, lifetime_container_fees, last_updated, created_at"
      )
      .eq("user_id", user.id)
      .maybeSingle()

    if (error) {
      console.error("user balance:", error)
      return NextResponse.json({ error: "Could not load balance" }, { status: 500 })
    }

    const payload = {
      total_earnings: Number(data?.total_earnings ?? 0),
      current_stake: Number(data?.current_stake ?? 0),
      available_balance: Number(data?.available_balance ?? 0),
      withdrawal_pending_balance: Number(
        (data as Record<string, unknown> | null)?.withdrawal_pending_balance ?? 0
      ),
      active_container_earnings: Number(data?.active_container_earnings ?? 0),
      container_withdrawable_earnings: Number(data?.container_withdrawable_earnings ?? 0),
      lifetime_container_withdrawn: Number(data?.lifetime_container_withdrawn ?? 0),
      lifetime_container_fees: Number(data?.lifetime_container_fees ?? 0),
      last_updated: data?.last_updated ?? null,
      created_at: data?.created_at ?? null,
    }

    return NextResponse.json(payload)
  } catch (e) {
    console.error("/api/user/balance:", e)
    const msg = e instanceof Error ? e.message : "Internal error"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
