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
import { createAuthSessionForEmail } from "@/lib/server/email-verification-session"
import { commitVerifiedProfileEmail } from "@/lib/server/pending-verification-email"
import { trackLoginSession } from "@/lib/server/login-session"
import { createRouteHandlerSupabaseClient } from "@/lib/supabase/route-handler"

/** Validates code from public.email_verifications (issued via Brevo SMTP). */

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
    const nowIso = new Date().toISOString()
    let userId = await findAuthUserIdByEmail(admin, email)
    if (!userId) {
      const { data: pendingRow } = await admin
        .from("email_verifications")
        .select("user_id")
        .eq("email", emailNormalized)
        .gt("expires_at", nowIso)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
      userId = pendingRow?.user_id ? String(pendingRow.user_id) : null
    }
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

    await commitVerifiedProfileEmail(admin, userId, emailNormalized)

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

    const { data: existingBalance } = await admin
      .from("user_balances")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle()

    if (!existingBalance) {
      const { error: balanceInsertErr } = await admin.from("user_balances").insert({
        user_id: userId,
        total_earnings: 0,
        current_stake: 0,
        available_balance: 0,
        last_updated: nowIso,
      })
      if (balanceInsertErr) {
        console.error("user_balances insert:", balanceInsertErr)
      }
    }

    await admin.from("email_verifications").delete().eq("user_id", userId)

    console.info(
      "[auth-email]",
      JSON.stringify({
        ts: new Date().toISOString(),
        channel: "verify_complete",
        outcome: "completed",
        user_id: userId,
        email_domain: emailNormalized.split("@")[1] ?? null,
        ip,
      }),
    )

    const { data: authUser } = await admin.auth.admin.getUserById(userId)
    const authEmail = authUser.user?.email?.trim().toLowerCase() ?? emailNormalized
    const sessionResult = await createAuthSessionForEmail(authEmail)
    if (!sessionResult.ok) {
      return NextResponse.json({ error: sessionResult.error }, { status: sessionResult.status })
    }

    try {
      const supabase = await createRouteHandlerSupabaseClient()
      const { data: sessionData } = await supabase.auth.getSession()
      const accessToken = sessionData.session?.access_token
      if (accessToken) {
        const gate = await trackLoginSession({
          userId: sessionResult.userId,
          bearerToken: accessToken,
          userAgent: request.headers.get("user-agent") ?? "",
          ipAddress: ip,
        })
        if (!gate.allowed) {
          await supabase.auth.signOut()
          return NextResponse.json(
            { error: gate.reason ?? "Sign-in blocked on this device." },
            { status: 403 },
          )
        }
      }
    } catch (e) {
      console.warn("[verify-code] session track:", e instanceof Error ? e.message : e)
    }

    return NextResponse.json({
      ok: true,
      session: true,
      message: "Email verified. Taking you to your dashboard.",
    })
  } catch (e) {
    console.error("verify-code:", e)
    const msg = e instanceof Error ? e.message : "Internal error"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
