import { createHash } from "crypto"
import { NextResponse } from "next/server"
import { getBearerTokenFromRequest, getUserFromBearer } from "@/lib/auth-api"
import { createAdminClient } from "@/lib/supabaseAdmin"

export async function GET(request: Request) {
  try {
    const user = await getUserFromBearer(request)
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const token = getBearerTokenFromRequest(request)
    const currentHash = token ? createHash("sha256").update(token).digest("hex") : ""
    const admin = createAdminClient()
    const { data, error } = await admin
      .from("login_sessions")
      .select("id,device_name,browser_name,status,first_seen_at,last_seen_at,revoked_at,session_token_hash")
      .eq("user_id", user.id)
      .order("last_seen_at", { ascending: false })
      .limit(50)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const items = (data ?? []).map((s) => ({
      id: s.id,
      device_name: s.device_name,
      browser_name: s.browser_name,
      status: s.status,
      first_seen_at: s.first_seen_at,
      last_seen_at: s.last_seen_at,
      revoked_at: s.revoked_at,
      is_current: s.session_token_hash === currentHash,
      is_online: s.status === "active" && Date.now() - new Date(s.last_seen_at).getTime() <= 5 * 60_000,
    }))
    return NextResponse.json({ items })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Internal error" }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await getUserFromBearer(request)
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const body = (await request.json().catch(() => ({}))) as { sessionId?: string }
    if (!body.sessionId) return NextResponse.json({ error: "sessionId is required" }, { status: 400 })
    const admin = createAdminClient()
    const { error } = await admin
      .from("login_sessions")
      .update({ status: "revoked", revoked_at: new Date().toISOString(), revoked_by: user.id })
      .eq("id", body.sessionId)
      .eq("user_id", user.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Internal error" }, { status: 500 })
  }
}
