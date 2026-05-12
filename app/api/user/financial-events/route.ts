import { NextResponse } from "next/server"
import { bearerUserWithGovernance } from "@/lib/server/account-governance"
import { createAdminClient } from "@/lib/supabaseAdmin"

export async function GET(request: Request) {
  try {
    const auth = await bearerUserWithGovernance(request, "read")
    if ("response" in auth) return auth.response
    const { user } = auth
    const admin = createAdminClient()
    const { data, error } = await admin
      .from("container_balance_events")
      .select(
        "id,event_type,category,gross_amount,net_amount,fee_amount,balance_source,balance_destination,status,transaction_ref,related_session_id,related_trade_id,related_container_id,actor_type,actor_id,summary,metadata,created_at"
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(120)
    if (error) throw new Error(error.message)
    /** Internal treasury mirror rows used to harass pool login accounts; summaries live on retailer events. */
    const filtered =
      data?.filter((row) => (row as { event_type?: string }).event_type !== "admin_retail_pool_debited") ?? []
    return NextResponse.json({ events: filtered.slice(0, 100) })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Internal error" },
      { status: 500 }
    )
  }
}
