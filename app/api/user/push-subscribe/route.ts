import { NextResponse } from "next/server"
import { bearerUserWithGovernance } from "@/lib/server/account-governance"
import { createAdminClient } from "@/lib/supabaseAdmin"

/** Register Web Push subscription (optional — requires VAPID keys on server). */
export async function POST(request: Request) {
  try {
    const auth = await bearerUserWithGovernance(request, "mutate")
    if ("response" in auth) return auth.response
    const { user } = auth
    const body = (await request.json().catch(() => ({}))) as {
      endpoint?: string
      keys?: { p256dh?: string; auth?: string }
      audience?: string
    }
    const endpoint = typeof body.endpoint === "string" ? body.endpoint.trim() : ""
    const p256dh = typeof body.keys?.p256dh === "string" ? body.keys.p256dh.trim() : ""
    const authSecret = typeof body.keys?.auth === "string" ? body.keys.auth.trim() : ""
    if (!endpoint || !p256dh || !authSecret) {
      return NextResponse.json({ error: "Invalid subscription." }, { status: 400 })
    }

    const audRaw = typeof body.audience === "string" ? body.audience.trim() : "customer"
    const audience = audRaw === "admin" || audRaw === "retailer" ? audRaw : "customer"

    const admin = createAdminClient()
    const now = new Date().toISOString()
    const { error } = await admin.from("nexus_push_subscriptions").upsert(
      {
        user_id: user.id,
        endpoint,
        p256dh,
        auth_secret: authSecret,
        audience,
        user_agent: request.headers.get("user-agent")?.slice(0, 240) ?? null,
        updated_at: now,
      },
      { onConflict: "user_id,endpoint" },
    )
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Internal error" }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const auth = await bearerUserWithGovernance(request, "mutate")
    if ("response" in auth) return auth.response
    const { user } = auth
    const body = (await request.json().catch(() => ({}))) as { endpoint?: string }
    const endpoint = typeof body.endpoint === "string" ? body.endpoint.trim() : ""
    const admin = createAdminClient()
    let q = admin.from("nexus_push_subscriptions").delete().eq("user_id", user.id)
    if (endpoint) q = q.eq("endpoint", endpoint)
    const { error } = await q
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Internal error" }, { status: 500 })
  }
}
