import { NextResponse } from "next/server"
import { externalApisBlockedResponse } from "@/lib/dev-local-api-guard"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { findAuthUserIdByEmail } from "@/lib/auth-users"
import {
  COUNTRY_CORRIDOR_REQUIRED_MESSAGE,
  enforceCountryCorridor,
  recordSignupCorridorEvent,
} from "@/lib/server/country-corridor-guard"
import { getRequestIpAddress } from "@/lib/server/request-geo"

/** Validates code from public.email_verifications (issued via Brevo). */

export async function POST(request: Request) {
  const blocked = externalApisBlockedResponse()
  if (blocked) return blocked
  try {
    let email: string | undefined
    let codeRaw: string | undefined
    try {
      const body = await request.json()
      email = typeof body.email === "string" ? body.email.trim() : undefined
      codeRaw = typeof body.code === "string" ? body.code.trim() : undefined
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }

    if (!email || !codeRaw) {
      return NextResponse.json({ error: "email and code are required" }, { status: 400 })
    }

    const emailNormalized = email.toLowerCase()
    const code = codeRaw.replace(/\D/g, "").slice(0, 6)
    if (code.length !== 6) {
      return NextResponse.json({ error: "Enter the 6-digit code" }, { status: 400 })
    }

    const admin = createAdminClient()
    const userId = await findAuthUserIdByEmail(admin, email)
    if (!userId) {
      return NextResponse.json({ error: "Invalid code or email" }, { status: 400 })
    }

    const { data: prof } = await admin
      .from("profiles")
      .select("funding_country_code")
      .eq("id", userId)
      .maybeSingle()
    const selectedCountry = String(prof?.funding_country_code ?? "").trim().toUpperCase().slice(0, 2)
    if (!selectedCountry) {
      return NextResponse.json({ error: COUNTRY_CORRIDOR_REQUIRED_MESSAGE }, { status: 403 })
    }

    const corridor = await enforceCountryCorridor(request, selectedCountry)
    const ip = getRequestIpAddress(request)
    await recordSignupCorridorEvent(admin, {
      action: "verify_code",
      selectedCountry,
      detectedCountry: corridor.ok ? corridor.detectedCountry : corridor.detectedCountry,
      ipAddress: ip,
      blocked: !corridor.ok,
      userId,
      email: emailNormalized,
      userAgent: request.headers.get("user-agent"),
      detail: corridor.ok ? null : corridor.message,
    })
    if (!corridor.ok) {
      return NextResponse.json({ error: corridor.message }, { status: 403 })
    }

    const nowIso = new Date().toISOString()

    const { data: rows, error: selErr } = await admin
      .from("email_verifications")
      .select("id")
      .eq("user_id", userId)
      .eq("email", emailNormalized)
      .eq("code", code)
      .gt("expires_at", nowIso)
      .limit(1)

    if (selErr) {
      console.error("verify-code select:", selErr)
      return NextResponse.json({ error: "Verification lookup failed" }, { status: 500 })
    }

    if (!rows?.length) {
      return NextResponse.json({ error: "Invalid or expired code" }, { status: 400 })
    }

    const { error: profileErr } = await admin
      .from("profiles")
      .update({ is_verified: true })
      .eq("id", userId)

    if (profileErr) {
      console.error("profiles update:", profileErr)
      return NextResponse.json({ error: "Could not activate account" }, { status: 500 })
    }

    const { error: confirmErr } = await admin.auth.admin.updateUserById(userId, {
      email_confirm: true,
    })

    if (confirmErr) {
      console.error("auth email_confirm:", confirmErr)
      return NextResponse.json(
        { error: "Could not finalize email confirmation" },
        { status: 500 }
      )
    }

    const { error: balanceUpsertErr } = await admin.from("user_balances").upsert(
      {
        user_id: userId,
        total_earnings: 0,
        current_stake: 0,
        available_balance: 0,
        last_updated: nowIso,
      },
      { onConflict: "user_id" }
    )

    if (balanceUpsertErr) {
      console.error("user_balances upsert:", balanceUpsertErr)
    }

    await admin.from("email_verifications").delete().eq("user_id", userId)

    return NextResponse.json({ ok: true, message: "Email verified. Sign in enabled." })
  } catch (e) {
    console.error("verify-code:", e)
    const msg = e instanceof Error ? e.message : "Internal error"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
