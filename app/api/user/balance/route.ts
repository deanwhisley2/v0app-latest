import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { getUserFromBearer } from "@/lib/auth-api"

export async function GET(request: Request) {
  try {
    const user = await getUserFromBearer(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const admin = createAdminClient()
    const { data, error } = await admin
      .from("user_balances")
      .select("total_earnings, current_stake, available_balance, last_updated, created_at")
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
