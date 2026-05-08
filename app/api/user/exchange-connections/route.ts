import { NextResponse } from "next/server"
import { getUserFromBearer } from "@/lib/auth-api"
import { mergeSafeUserMetadata } from "@/lib/server/auth-jwt-metadata"
import { createAdminClient } from "@/lib/supabaseAdmin"

/**
 * Persists canonical exchange payloads to profiles.nexus_exchanges and mirrors to Supabase Auth user_metadata.
 */
export async function POST(request: Request) {
  try {
    const user = await getUserFromBearer(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const connections = body.connections ?? body.exchanges ?? body.items
    if (!Array.isArray(connections)) {
      return NextResponse.json({ error: "connections array required" }, { status: 400 })
    }

    const raw = JSON.stringify(connections).length
    if (raw > 256_000) {
      return NextResponse.json({ error: "connections payload too large" }, { status: 413 })
    }

    const admin = createAdminClient()
    const { data: updated, error: profileErr } = await admin
      .from("profiles")
      .update({
        nexus_exchanges: connections as unknown[],
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id)
      .select("id")

    if (profileErr) {
      console.error("[exchange-connections] profiles update:", profileErr.message)
      return NextResponse.json({ error: `profiles update failed — ${profileErr.message}` }, { status: 500 })
    }

    if (!updated?.length) {
      return NextResponse.json(
        { error: "No profile row for user — complete registration or run profiles trigger." },
        { status: 409 }
      )
    }

    let metaSyncFailed: string | null = null
    try {
      const { data: current, error: getErr } = await admin.auth.admin.getUserById(user.id)
      if (getErr) throw getErr
      const prev = (current.user?.user_metadata ?? {}) as Record<string, unknown>
      const { error: updateErr } = await admin.auth.admin.updateUserById(user.id, {
        user_metadata: mergeSafeUserMetadata(prev, {
          nexus_exchanges: connections as unknown[],
        }),
      })
      if (updateErr) throw updateErr
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      metaSyncFailed = msg
      console.warn("[exchange-connections] user_metadata mirror failed:", msg)
    }

    return NextResponse.json({ ok: true, metaSyncFailed })
  } catch (e) {
    console.error("[exchange-connections] POST:", e)
    const msg = e instanceof Error ? e.message : "Internal error"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
