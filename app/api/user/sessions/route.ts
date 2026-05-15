import { createHash } from "crypto"
import { NextResponse } from "next/server"
import { getBearerTokenFromRequest } from "@/lib/auth-api"
import { bearerUserWithGovernance } from "@/lib/server/account-governance"
import { createAdminClient } from "@/lib/supabaseAdmin"

export async function GET(request: Request) {
  try {
    const auth = await bearerUserWithGovernance(request, "read")
    if ("response" in auth) return auth.response
    const { user } = auth
    const token = getBearerTokenFromRequest(request)
    const currentHash = token ? createHash("sha256").update(token).digest("hex") : ""
    const admin = createAdminClient()
    const { data, error } = await admin
      .from("login_sessions")
      .select(
        "id,device_name,browser_name,status,device_trust,ip_address,first_seen_at,last_seen_at,revoked_at,session_token_hash",
      )
      .eq("user_id", user.id)
      .order("last_seen_at", { ascending: false })
      .limit(50)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const items = (data ?? []).map((s) => ({
      id: s.id,
      device_name: s.device_name,
      browser_name: s.browser_name,
      status: s.status,
      device_trust: s.device_trust ?? "neutral",
      ip_address: s.ip_address ?? null,
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

export async function PATCH(request: Request) {
  try {
    const auth = await bearerUserWithGovernance(request, "mutate")
    if ("response" in auth) return auth.response
    const { user } = auth
    const body = (await request.json().catch(() => ({}))) as {
      sessionId?: string
      action?: "trust" | "block" | "revoke"
    }
    const sessionId = typeof body.sessionId === "string" ? body.sessionId.trim() : ""
    const action = body.action
    if (!sessionId || !action) {
      return NextResponse.json({ error: "sessionId and action are required" }, { status: 400 })
    }

    const admin = createAdminClient()
    const now = new Date().toISOString()

    if (action === "trust") {
      const { error } = await admin
        .from("login_sessions")
        .update({ device_trust: "trusted", status: "active", revoked_at: null, revoked_by: null })
        .eq("id", sessionId)
        .eq("user_id", user.id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    } else if (action === "block" || action === "revoke") {
      const { error } = await admin
        .from("login_sessions")
        .update({
          device_trust: "blocked",
          status: "revoked",
          revoked_at: now,
          revoked_by: user.id,
        })
        .eq("id", sessionId)
        .eq("user_id", user.id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    } else {
      return NextResponse.json({ error: "Invalid action." }, { status: 400 })
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Internal error" }, { status: 500 })
  }
}

/** @deprecated Use PATCH action=block instead */
export async function DELETE(request: Request) {
  try {
    const auth = await bearerUserWithGovernance(request, "mutate")
    if ("response" in auth) return auth.response
    const { user } = auth
    const body = (await request.json().catch(() => ({}))) as { sessionId?: string }
    if (!body.sessionId) return NextResponse.json({ error: "sessionId is required" }, { status: 400 })
    const admin = createAdminClient()
    const { error } = await admin
      .from("login_sessions")
      .update({
        device_trust: "blocked",
        status: "revoked",
        revoked_at: new Date().toISOString(),
        revoked_by: user.id,
      })
      .eq("id", body.sessionId)
      .eq("user_id", user.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Internal error" }, { status: 500 })
  }
}
