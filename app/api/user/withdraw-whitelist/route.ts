import { NextResponse } from "next/server"
import { bearerUserWithGovernance } from "@/lib/server/account-governance"
import { createAdminClient } from "@/lib/supabaseAdmin"

type WhitelistKind = "mobile_number" | "crypto_address"

export async function GET(request: Request) {
  try {
    const auth = await bearerUserWithGovernance(request, "read")
    if ("response" in auth) return auth.response
    const { user } = auth
    const admin = createAdminClient()
    const { data, error } = await admin
      .from("withdraw_whitelist_entries")
      .select("id,kind,holder_name,value,label,created_at")
      .eq("user_id", user.id)
      .is("removed_at", null)
      .order("created_at", { ascending: false })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ items: data ?? [] })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Internal error" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const auth = await bearerUserWithGovernance(request, "mutate")
    if ("response" in auth) return auth.response
    const { user } = auth
    const body = (await request.json().catch(() => ({}))) as {
      kind?: WhitelistKind
      holder_name?: string
      value?: string
      label?: string
    }
    const kind = body.kind
    const holderName = typeof body.holder_name === "string" ? body.holder_name.trim() : ""
    const value = typeof body.value === "string" ? body.value.trim() : ""
    const label = typeof body.label === "string" ? body.label.trim() : null
    if (kind !== "mobile_number" && kind !== "crypto_address") {
      return NextResponse.json({ error: "kind must be mobile_number or crypto_address" }, { status: 400 })
    }
    if (!holderName || !value) {
      return NextResponse.json({ error: "holder_name and value are required" }, { status: 400 })
    }
    const admin = createAdminClient()
    const { count, error: countErr } = await admin
      .from("withdraw_whitelist_entries")
      .select("id", { head: true, count: "exact" })
      .eq("user_id", user.id)
      .is("removed_at", null)
    if (countErr) return NextResponse.json({ error: countErr.message }, { status: 500 })
    if ((count ?? 0) >= 3) {
      return NextResponse.json({ error: "Maximum 3 whitelist entries allowed" }, { status: 400 })
    }
    const { data, error } = await admin
      .from("withdraw_whitelist_entries")
      .insert({ user_id: user.id, kind, holder_name: holderName, value, label })
      .select("id,kind,holder_name,value,label,created_at")
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true, item: data })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Internal error" }, { status: 500 })
  }
}
