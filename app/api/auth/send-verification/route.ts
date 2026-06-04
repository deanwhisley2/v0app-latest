import { NextResponse } from "next/server"
import { externalApisBlockedResponse } from "@/lib/dev-local-api-guard"
import { issueEmailVerificationCode } from "@/lib/email-verification-issue"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { findAuthUserIdByEmail } from "@/lib/auth-users"
import {
  COUNTRY_CORRIDOR_REQUIRED_MESSAGE,
  enforceCountryCorridor,
  recordSignupCorridorEvent,
} from "@/lib/server/country-corridor-guard"
import { isSupportedOperatingCountry } from "@/lib/operating-countries"
import { getRequestIpAddress } from "@/lib/server/request-geo"

/** App sends the message via Cyberpersons; codes live in public.email_verifications (service role). */

export async function POST(req: Request) {
  const blocked = externalApisBlockedResponse()
  if (blocked) return blocked
  let email: string | undefined
  let fundingCountry: string | undefined
  try {
    const body = await req.json()
    email = typeof body.email === "string" ? body.email.trim() : undefined
    fundingCountry =
      typeof body.funding_country_code === "string"
        ? body.funding_country_code.trim().toUpperCase().slice(0, 2)
        : undefined
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  if (!email) {
    return NextResponse.json({ error: "email is required" }, { status: 400 })
  }

  let selectedCountry = fundingCountry && isSupportedOperatingCountry(fundingCountry) ? fundingCountry : ""
  if (!selectedCountry) {
    try {
      const admin = createAdminClient()
      const userId = await findAuthUserIdByEmail(admin, email)
      if (userId) {
        const { data: prof } = await admin
          .from("profiles")
          .select("funding_country_code")
          .eq("id", userId)
          .maybeSingle()
        selectedCountry = String(prof?.funding_country_code ?? "")
          .trim()
          .toUpperCase()
          .slice(0, 2)
      }
    } catch {
      /* ignore */
    }
  }

  if (!selectedCountry) {
    return NextResponse.json({ error: COUNTRY_CORRIDOR_REQUIRED_MESSAGE }, { status: 400 })
  }

  const corridor = await enforceCountryCorridor(req, selectedCountry)
  try {
    const admin = createAdminClient()
    const userId = await findAuthUserIdByEmail(admin, email).catch(() => null)
    await recordSignupCorridorEvent(admin, {
      action: "send_verification",
      selectedCountry,
      detectedCountry: corridor.ok ? corridor.detectedCountry : corridor.detectedCountry,
      ipAddress: getRequestIpAddress(req),
      blocked: !corridor.ok,
      userId,
      email,
      userAgent: req.headers.get("user-agent"),
      detail: corridor.ok ? null : corridor.message,
    })
  } catch {
    /* audit */
  }

  if (!corridor.ok) {
    return NextResponse.json({ error: corridor.message }, { status: 403 })
  }

  const result = await issueEmailVerificationCode(email)

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status ?? 400 }
    )
  }

  if (result.ambiguous) {
    return NextResponse.json({
      ok: true,
      message: "If an account exists for this email, a code was sent.",
    })
  }

  return NextResponse.json({ message: "Verification code sent" })
}
