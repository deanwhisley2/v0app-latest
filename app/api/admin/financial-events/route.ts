import { NextResponse } from "next/server"
import { getUserFromBearer } from "@/lib/auth-api"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { requireAdminUser } from "@/lib/server/security-authz"

export async function GET(request: Request) {
  try {
    const user = await getUserFromBearer(request)
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    await requireAdminUser(user)

    const { searchParams } = new URL(request.url)
    const limit = Math.min(Number(searchParams.get("limit") ?? 400), 800)
    const since = searchParams.get("since") ?? ""

    const admin = createAdminClient()
    const lim = Number.isFinite(limit) && limit > 0 ? limit : 400

    let query = admin.from("container_balance_events").select(
      "id,user_id,event_type,category,gross_amount,status,transaction_ref,summary,balance_source,balance_destination,actor_type,actor_id,created_at,metadata"
    )
    if (since) {
      query = query.gte("created_at", since)
    }
    const { data, error } = await query.order("created_at", { ascending: false }).limit(lim)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ events: data ?? [] })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Forbidden" }, { status: 403 })
  }
}
