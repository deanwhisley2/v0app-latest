import { NextResponse } from "next/server"
import { getUserFromBearer } from "@/lib/auth-api"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { requireLiquidityAdminLevel5 } from "@/lib/server/security-authz"

/** Level 5: list all operational support threads (newest first). */
export async function GET(request: Request) {
  try {
    const actor = await getUserFromBearer(request)
    if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    await requireLiquidityAdminLevel5(actor)

    const admin = createAdminClient()
    const { data, error } = await admin
      .from("operational_support_threads")
      .select(
        "id,user_id,category,status,linked_kind,linked_id,assigned_admin_id,escalated,unread_for_admin,unread_for_user,last_message_at,created_at,updated_at"
      )
      .order("last_message_at", { ascending: false })
      .limit(200)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ threads: data ?? [] })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Forbidden"
    return NextResponse.json({ error: msg }, { status: msg.includes("Level 5") ? 403 : 500 })
  }
}
