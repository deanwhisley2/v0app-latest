import { NextResponse } from "next/server"
import { externalApisBlockedResponse } from "@/lib/dev-local-api-guard"
import { isValidRegisterEmail } from "@/lib/auth/register-contact"
import { findAuthUserIdByEmail } from "@/lib/auth-users"
import { createAdminClient } from "@/lib/supabaseAdmin"

type Body = { email?: string }

/**
 * POST /api/auth/lookup-email
 * Lightweight account hint for smart sign-in / registration routing.
 */
export async function POST(request: Request) {
  const blocked = externalApisBlockedResponse()
  if (blocked) return blocked

  let body: Body
  try {
    body = (await request.json()) as Body
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : ""
  if (!email || !isValidRegisterEmail(email)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 })
  }

  try {
    const admin = createAdminClient()
    const userId = await findAuthUserIdByEmail(admin, email)
    if (!userId) {
      return NextResponse.json({ ok: true, exists: false, hasPhone: false })
    }

    const { data: profile, error } = await admin
      .from("profiles")
      .select("phone")
      .eq("id", userId)
      .maybeSingle()
    if (error) {
      console.error("lookup-email profile:", error)
      return NextResponse.json({ ok: true, exists: true, hasPhone: false })
    }

    const phone = typeof profile?.phone === "string" ? profile.phone.trim() : ""
    return NextResponse.json({ ok: true, exists: true, hasPhone: phone.length >= 9 })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Lookup failed"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
