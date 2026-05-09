import { NextResponse } from "next/server"
import { getUserFromBearer } from "@/lib/auth-api"
import { createAdminClient } from "@/lib/supabaseAdmin"

export async function GET(request: Request) {
  try {
    const user = await getUserFromBearer(request)
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const admin = createAdminClient()
    const { data, error } = await admin
      .from("container_balance_events")
      .select(
        "id,event_type,category,gross_amount,net_amount,fee_amount,balance_source,balance_destination,status,transaction_ref,related_session_id,related_trade_id,related_container_id,actor_type,actor_id,summary,created_at"
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(100)
    if (error) throw new Error(error.message)
    return NextResponse.json({ events: data ?? [] })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Internal error" },
      { status: 500 }
    )
  }
}
