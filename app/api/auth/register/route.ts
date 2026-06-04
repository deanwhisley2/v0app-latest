import { NextResponse } from "next/server"
import { externalApisBlockedResponse } from "@/lib/dev-local-api-guard"
import { createRouteHandlerSupabaseClient } from "@/lib/supabase/route-handler"
import { issueEmailVerificationCode } from "@/lib/email-verification-issue"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { normalizeReferralCodeInput } from "@/lib/referral-code"
import { findAuthUserIdByEmail } from "@/lib/auth-users"
import { grantNewMemberWelcomeBonus } from "@/lib/server/new-member-campaign"
import { isSupportedOperatingCountry } from "@/lib/operating-countries"
import { displayCurrencyForCustomer } from "@/lib/customer-display-currency"
import {
  COUNTRY_CORRIDOR_REQUIRED_MESSAGE,
  enforceCountryCorridor,
  recordSignupCorridorEvent,
} from "@/lib/server/country-corridor-guard"
import { getRequestIpAddress } from "@/lib/server/request-geo"
import { normalizeCampaignSlugInput } from "@/lib/marketing/campaign-slug"
import { runRegisterPostSignup } from "@/lib/server/register-post-signup"
import {
  friendlyRegisterAuthError,
  isAuthDuplicateSignupError,
} from "@/lib/server/register-auth-errors"

type RegisterBody = {
  email?: string
  password?: string
  full_name?: string
  phone?: string
  preferred_language?: string
  preferred_currency?: string
  funding_country_code?: string
  referral_code?: string
  campaign_slug?: string
  security_code?: string
  deposit_number?: string
  withdrawal_number?: string
}

/**
 * Admin createUser (no Supabase confirmation email wait) + Cyberpersons verification code.
 * Disable “Confirm email” in Supabase Auth so Auth SMTP does not run on signup.
 */
export async function POST(request: Request) {
  const blocked = externalApisBlockedResponse()
  if (blocked) return blocked
  let body: RegisterBody
  try {
    body = (await request.json()) as RegisterBody
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const email = typeof body.email === "string" ? body.email.trim() : ""
  const password = typeof body.password === "string" ? body.password : ""
  const full_name = typeof body.full_name === "string" ? body.full_name.trim() : ""
  const phone = typeof body.phone === "string" ? body.phone.trim() : ""
  const preferred_language =
    typeof body.preferred_language === "string" ? body.preferred_language.trim().slice(0, 12) : ""
  const preferred_currency_raw =
    typeof body.preferred_currency === "string" ? body.preferred_currency.trim().toUpperCase().slice(0, 8) : ""
  const funding_country_raw =
    typeof body.funding_country_code === "string" ? body.funding_country_code.trim().toUpperCase().slice(0, 2) : ""
  const funding_country_code = /^[A-Z]{2}$/.test(funding_country_raw) ? funding_country_raw : ""
  const preferred_currency = displayCurrencyForCustomer(
    funding_country_code,
    preferred_currency_raw || null,
  )
  const referralInvite = normalizeReferralCodeInput(
    typeof body.referral_code === "string" ? body.referral_code : "",
  )
  const campaignSlug = normalizeCampaignSlugInput(
    typeof body.campaign_slug === "string" ? body.campaign_slug : "",
  )
  const security_code = typeof body.security_code === "string" ? body.security_code.trim() : ""
  const deposit_number = typeof body.deposit_number === "string" ? body.deposit_number.trim() : ""
  const withdrawal_number =
    typeof body.withdrawal_number === "string" ? body.withdrawal_number.trim() : ""

  if (!email || !password) {
    return NextResponse.json({ error: "email and password are required" }, { status: 400 })
  }

  if (!funding_country_code || !isSupportedOperatingCountry(funding_country_code)) {
    return NextResponse.json({ error: COUNTRY_CORRIDOR_REQUIRED_MESSAGE }, { status: 400 })
  }

  const corridor = await enforceCountryCorridor(request, funding_country_code)
  const ip = getRequestIpAddress(request)
  const userAgent = request.headers.get("user-agent")

  try {
    const adminAudit = createAdminClient()
    await recordSignupCorridorEvent(adminAudit, {
      action: "register",
      selectedCountry: funding_country_code,
      detectedCountry: corridor.ok ? corridor.detectedCountry : corridor.detectedCountry,
      ipAddress: ip,
      blocked: !corridor.ok,
      email,
      userAgent,
      detail: corridor.ok ? corridor.warning ?? null : corridor.message,
    })
  } catch {
    /* audit best-effort */
  }

  if (!corridor.ok) {
    return NextResponse.json({ error: corridor.message }, { status: 403 })
  }
  if (!/^\d{6}$/.test(security_code)) {
    return NextResponse.json({ error: "Nexus Security Code must be exactly 6 digits." }, { status: 400 })
  }
  if (!deposit_number || deposit_number.length < 8) {
    return NextResponse.json({ error: "Deposit number is required." }, { status: 400 })
  }
  if (!withdrawal_number || withdrawal_number.length < 8) {
    return NextResponse.json({ error: "Withdrawal number is required." }, { status: 400 })
  }

  const admin = createAdminClient()
  const emailNormalized = email.toLowerCase()
  const userMetadata: Record<string, unknown> = {
    full_name,
    phone,
    security_profile_required: true,
    ...(preferred_language ? { preferred_language } : {}),
    ...(preferred_currency ? { preferred_currency } : {}),
  }

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: emailNormalized,
    password,
    email_confirm: false,
    user_metadata: userMetadata,
  })

  if (createError) {
    if (!isAuthDuplicateSignupError(createError)) {
      return NextResponse.json(
        { error: friendlyRegisterAuthError(createError.message) },
        { status: 400 },
      )
    }
    try {
      const existingId = await findAuthUserIdByEmail(admin, email)
      if (!existingId) {
        return NextResponse.json(
          { error: friendlyRegisterAuthError(createError.message) },
          { status: 400 },
        )
      }
      const { data: profRow } = await admin
        .from("profiles")
        .select("is_verified")
        .eq("id", existingId)
        .maybeSingle()
      if (profRow?.is_verified === true) {
        return NextResponse.json(
          {
            error:
              "This email is already registered. Sign in with your password, or use Forgot password if you need a reset.",
          },
          { status: 400 },
        )
      }
      const issued = await issueEmailVerificationCode(email)
      if (!issued.ok) {
        return NextResponse.json(
          { error: issued.error },
          { status: issued.status ?? 400 },
        )
      }
      try {
        const granted = await grantNewMemberWelcomeBonus(admin, existingId, "registration")
        if (!granted) {
          console.warn("[register] welcome bonus not granted (duplicate-email path):", existingId)
        }
      } catch (grantErr) {
        console.warn(
          "[register] welcome bonus (duplicate-email path):",
          grantErr instanceof Error ? grantErr.message : String(grantErr),
        )
      }
      const supabase = await createRouteHandlerSupabaseClient()
      await supabase.auth.signOut()
      return NextResponse.json({ ok: true })
    } catch (e) {
      console.warn("[register] duplicate-email resend path:", e instanceof Error ? e.message : String(e))
      return NextResponse.json(
        { error: friendlyRegisterAuthError(createError.message) },
        { status: 400 },
      )
    }
  }

  const newUserId = created.user?.id
  if (newUserId) {
    runRegisterPostSignup(admin, {
      userId: newUserId,
      email: emailNormalized,
      fundingCountryCode: funding_country_code,
      referralInvite,
      campaignSlug,
      securityCode: security_code,
      depositNumber: deposit_number,
      withdrawalNumber: withdrawal_number,
      userMetadata,
    })
  }

  const issued = await issueEmailVerificationCode(email)
  if (!issued.ok) {
    return NextResponse.json(
      { error: issued.error },
      { status: issued.status ?? 400 },
    )
  }

  return NextResponse.json({ ok: true })
}
