import { NextResponse } from "next/server"
import { getUserFromBearer } from "@/lib/auth-api"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { requireLiquidityAdminLevel5 } from "@/lib/server/security-authz"

export async function GET(request: Request) {
  try {
    const actor = await getUserFromBearer(request)
    if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    await requireLiquidityAdminLevel5(actor)

    const { searchParams } = new URL(request.url)
    const userId = (searchParams.get("userId") ?? "").trim()
    if (!userId) return NextResponse.json({ error: "userId is required." }, { status: 400 })
    const limit = Math.min(500, Math.max(1, Number(searchParams.get("limit") ?? 200)))

    const admin = createAdminClient()
    const { data, error } = await admin
      .from("user_account_notifications")
      .select(
        "id,user_id,notification_type,title,body,nav,read_at,user_deleted_at,metadata,created_at"
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit)
    if (error) throw new Error(error.message)
    return NextResponse.json({ items: data ?? [] })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Forbidden"
    return NextResponse.json({ error: msg }, { status: msg.includes("Level 5") ? 403 : 500 })
  }
}
