import { NextResponse } from "next/server"
import { getUserFromBearer } from "@/lib/auth-api"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { requireAdminUser } from "@/lib/server/security-authz"

export async function GET(request: Request) {
  try {
    const user = await getUserFromBearer(request)
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    await requireAdminUser(user)
    const admin = createAdminClient()
    const { data, error } = await admin
      .from("withdraw_whitelist_entries")
      .select("id,user_id,kind,holder_name,value,label,created_at,removed_at")
      .order("created_at", { ascending: false })
      .limit(200)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ items: data ?? [] })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Forbidden" }, { status: 403 })
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await getUserFromBearer(request)
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    await requireAdminUser(user)
    const body = (await request.json().catch(() => ({}))) as { id?: string }
    if (!body.id) return NextResponse.json({ error: "id is required" }, { status: 400 })
    const admin = createAdminClient()
    const { error } = await admin
      .from("withdraw_whitelist_entries")
      .update({ removed_at: new Date().toISOString(), removed_by: user.id })
      .eq("id", body.id)
      .is("removed_at", null)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Forbidden" }, { status: 403 })
  }
}
