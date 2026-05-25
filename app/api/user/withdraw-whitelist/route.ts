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
    return NextResponse.json(
      {
        error:
          "Direct payout edits are disabled. Open Settings → Security & Recovery → Request account detail update.",
        code: "security_appeal_required",
      },
      { status: 403 },
    )
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Internal error" }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const auth = await bearerUserWithGovernance(request, "mutate")
    if ("response" in auth) return auth.response
    return NextResponse.json(
      {
        error: "Direct payout removal is disabled. Submit a security change appeal in Settings.",
        code: "security_appeal_required",
      },
      { status: 403 },
    )
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Internal error" }, { status: 500 })
  }
}
