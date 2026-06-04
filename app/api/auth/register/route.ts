import { NextResponse } from "next/server"
import { externalApisBlockedResponse } from "@/lib/dev-local-api-guard"
import { createRouteHandlerSupabaseClient } from "@/lib/supabase/route-handler"
import { issueEmailVerificationCode } from "@/lib/email-verification-issue"
import { mergeSafeUserMetadata } from "@/lib/server/auth-jwt-metadata"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { setupSecurityProfile } from "@/lib/server/user-security-profile-service"
import { normalizeReferralCodeInput, referralCodeForUserId } from "@/lib/referral-code"
import { getPublicSiteOrigin } from "@/lib/site-public-url"
import { findAuthUserIdByEmail } from "@/lib/auth-users"
import { isReferralAttributionBlocked } from "@/lib/server/referral-attribution-guard"
import {
  notifyLaunchWelcome,
  notifyReferrerNewReferee,
} from "@/lib/server/launch-notifications"
import { grantNewMemberWelcomeBonus } from "@/lib/server/new-member-campaign"
import { isSupportedOperatingCountry } from "@/lib/operating-countries"
import { displayCurrencyForCustomer } from "@/lib/customer-display-currency"
import {
  COUNTRY_CORRIDOR_REQUIRED_MESSAGE,
  enforceCountryCorridor,
  recordSignupCorridorEvent,
} from "@/lib/server/country-corridor-guard"
import { getRequestIpAddress } from "@/lib/server/request-geo"

/** Supabase rejects a second signUp for the same email even if the first account never completed in-app verification. */
function isAuthDuplicateSignupError(err: { message?: string | null; code?: string | null }): boolean {
  const raw = `${err.code ?? ""} ${err.message ?? ""}`.toLowerCase()
  if (raw.includes("user_already_exists")) return true
  if (raw.includes("already registered")) return true
  if (raw.includes("already been registered")) return true
  if (raw.includes("email address") && raw.includes("already")) return true
  return false
}

type RegisterBody = {
  email?: string
  password?: string
  full_name?: string
  phone?: string
  preferred_language?: string
  preferred_currency?: string
  /** ISO 3166-1 alpha-2 — persisted to profiles.funding_country_code when valid */
  funding_country_code?: string
  referral_code?: string
  security_code?: string
  deposit_number?: string
  withdrawal_number?: string
}

/**
 * Supabase Auth signUp + Cyberpersons verification email (see public.email_verifications).
 * Disable “Confirm email” in Supabase Auth to avoid duplicate mails from Auth SMTP.
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
  const full_name =
    typeof body.full_name === "string" ? body.full_name.trim() : ""
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
    typeof body.referral_code === "string" ? body.referral_code : ""
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

  const supabase = await createRouteHandlerSupabaseClient()
  const origin = getPublicSiteOrigin(request.url)
  const emailRedirectTo = `${origin}/auth/verify`

  const nowIso = new Date().toISOString()
  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo,
      data: {
        full_name,
        phone,
        security_profile_required: true,
        ...(preferred_language ? { preferred_language } : {}),
        ...(preferred_currency ? { preferred_currency } : {}),
      },
    },
  })

  if (signUpError) {
    if (!isAuthDuplicateSignupError(signUpError)) {
      return NextResponse.json({ error: signUpError.message }, { status: 400 })
    }
    try {
      const admin = createAdminClient()
      const existingId = await findAuthUserIdByEmail(admin, email)
      if (!existingId) {
        return NextResponse.json({ error: signUpError.message }, { status: 400 })
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
          { status: 400 }
        )
      }
      const issued = await issueEmailVerificationCode(email)
      if (!issued.ok) {
        return NextResponse.json(
          { error: issued.error },
          { status: issued.status ?? 400 }
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
      await supabase.auth.signOut()
      return NextResponse.json({ ok: true })
    } catch (e) {
      console.warn("[register] duplicate-email resend path:", e instanceof Error ? e.message : String(e))
      return NextResponse.json({ error: signUpError.message }, { status: 400 })
    }
  }

  const newUserId = signUpData.user?.id
  if (newUserId) {
    try {
      const admin = createAdminClient()

      let referredByUserId: string | null = null
      if (referralInvite.length >= 4) {
        const { data: refProfile } = await admin
          .from("profiles")
          .select("id")
          .eq("referral_code", referralInvite)
          .maybeSingle()
        const rid = refProfile?.id as string | undefined
        if (rid && rid !== newUserId) {
          const blocked = await isReferralAttributionBlocked(admin, rid)
          if (!blocked) referredByUserId = rid
        }
      }

      const countryForProfile = funding_country_code

      for (let attempt = 0; attempt < 8; attempt++) {
        const seed = attempt === 0 ? newUserId : `${newUserId}:${attempt}`
        const myReferralCode = referralCodeForUserId(seed)
        const patch: Record<string, unknown> = {
          referral_code: myReferralCode,
          updated_at: nowIso,
        }
        if (referredByUserId) patch.referred_by = referredByUserId

        const { error: refErr } = await admin.from("profiles").update(patch).eq("id", newUserId)
        if (!refErr) break
        const msg = (refErr.message ?? "").toLowerCase()
        if (!msg.includes("unique") && !msg.includes("duplicate")) {
          console.warn("[register] referral profile update:", refErr.message)
          break
        }
      }

      if (countryForProfile) {
        const { error: fcErr } = await admin
          .from("profiles")
          .update({ funding_country_code: countryForProfile, updated_at: nowIso })
          .eq("id", newUserId)
        if (fcErr) {
          console.warn("[register] funding_country_code profile update:", fcErr.message)
        }
      }

      if (referredByUserId) {
        void notifyReferrerNewReferee(admin, referredByUserId, newUserId)
      }
      void notifyLaunchWelcome(admin, newUserId, countryForProfile)
      const welcomeGranted = await grantNewMemberWelcomeBonus(admin, newUserId, "registration")
      if (!welcomeGranted) {
        console.warn("[register] welcome bonus not granted:", newUserId)
      }

      try {
        await setupSecurityProfile(admin, {
          userId: newUserId,
          securityCode: security_code,
          mtnDepositNumber: deposit_number,
          mtnWithdrawalNumber: withdrawal_number,
          payoutMethod: "mobile_money",
        })
      } catch (secErr) {
        console.warn(
          "[register] security profile setup:",
          secErr instanceof Error ? secErr.message : String(secErr),
        )
      }

      const meta = (signUpData.user?.user_metadata ?? {}) as Record<string, unknown>
      const { error: metaStripErr } = await admin.auth.admin.updateUserById(newUserId, {
        user_metadata: mergeSafeUserMetadata(meta, {
          security_profile_required: true,
        }),
      })
      if (metaStripErr) {
        console.warn("[register] user_metadata sanitize:", metaStripErr.message)
      }
    } catch (e) {
      console.warn("[register] post-signup profile/metadata:", e instanceof Error ? e.message : String(e))
    }
  }

  const issued = await issueEmailVerificationCode(email)
  if (!issued.ok) {
    return NextResponse.json(
      { error: issued.error },
      { status: issued.status ?? 400 }
    )
  }

  await supabase.auth.signOut()

  return NextResponse.json({ ok: true })
}
