import { NextResponse } from "next/server"
import { getUserFromBearer } from "@/lib/auth-api"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { coerceExchangeBalancesSnapshot } from "@/lib/exchange-balances-snapshot-types"

/** POST — persist USD-only exchange rollup to profiles (no API secrets). */
export async function POST(request: Request) {
  try {
    const user = await getUserFromBearer(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const raw = body.snapshot ?? body.balancesSnapshot
    const snapshot = coerceExchangeBalancesSnapshot(raw)
    if (!snapshot) {
      return NextResponse.json(
        { error: "Invalid snapshot (expect v:1, updatedAt, totalUsd, exchanges[])" },
        { status: 400 }
      )
    }

    const rawLen = JSON.stringify(snapshot).length
    if (rawLen > 128_000) {
      return NextResponse.json({ error: "snapshot payload too large" }, { status: 413 })
    }

    const admin = createAdminClient()
    const { data: updated, error: profileErr } = await admin
      .from("profiles")
      .update({
        nexus_exchange_balances_snapshot: snapshot,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id)
      .select("id")

    if (profileErr) {
      console.error("[exchange-balances-snapshot] profiles update:", profileErr.message)
      return NextResponse.json({ error: `profiles update failed — ${profileErr.message}` }, { status: 500 })
    }

    if (!updated?.length) {
      return NextResponse.json(
        { error: "No profile row for user — complete registration or run profiles trigger." },
        { status: 409 }
      )
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error("[exchange-balances-snapshot] POST:", e)
    const msg = e instanceof Error ? e.message : "Internal error"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
