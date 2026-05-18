import { NextResponse } from "next/server"
import { bearerUserWithGovernance } from "@/lib/server/account-governance"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { isSupportedOperatingCountry } from "@/lib/operating-countries"
import { enforceCountryCorridor } from "@/lib/server/country-corridor-guard"

/** Level 1: persist preferred country for local retailer matching (ISO 3166-1 alpha-2). */
export async function POST(request: Request) {
  try {
    const auth = await bearerUserWithGovernance(request, "mutate")
    if ("response" in auth) return auth.response
    const { user } = auth
    const body = (await request.json().catch(() => ({}))) as { code?: string }
    const code = typeof body.code === "string" ? body.code.trim().toUpperCase().slice(0, 2) : ""
    if (!code || !isSupportedOperatingCountry(code)) {
      return NextResponse.json({ error: "Unsupported or invalid country code." }, { status: 400 })
    }
    const corridor = await enforceCountryCorridor(request, code)
    if (!corridor.ok) {
      return NextResponse.json({ error: corridor.message }, { status: 403 })
    }
    const admin = createAdminClient()
    const { error } = await admin.from("profiles").update({ funding_country_code: code }).eq("id", user.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true, fundingCountryCode: code })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Internal error" }, { status: 500 })
  }
}
