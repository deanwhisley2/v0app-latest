import { NextResponse } from "next/server"
import { externalApisBlockedResponse } from "@/lib/dev-local-api-guard"
import { issueEmailVerificationCode } from "@/lib/email-verification-issue"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { normalizeReferralCodeInput } from "@/lib/referral-code"
import { findAuthUserIdByEmail } from "@/lib/auth-users"
import { isSupportedOperatingCountry } from "@/lib/operating-countries"
import { displayCurrencyForCustomer } from "@/lib/customer-display-currency"
import {
  COUNTRY_CORRIDOR_REQUIRED_MESSAGE,
  enforceCountryCorridor,
  recordSignupCorridorEvent,
} from "@/lib/server/country-corridor-guard"
import { getRequestIpAddress } from "@/lib/server/request-geo"
import { normalizeCampaignSlugInput } from "@/lib/marketing/campaign-slug"
import {
  grantRegisterWelcomeBonus,
  runRegisterPostSignup,
} from "@/lib/server/register-post-signup"
import {
  friendlyRegisterAuthError,
  isAuthDuplicateSignupError,
} from "@/lib/server/register-auth-errors"
import {
  resolveRegisterAuthEmail,
  validateRegisterContact,
} from "@/lib/auth/register-contact"
import { resolveIdentifierToEmail } from "@/lib/server/auth-identifier"
import { createAuthSessionForEmail } from "@/lib/server/email-verification-session"
import { trackLoginSession } from "@/lib/server/login-session"

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
}

export async function POST(request: Request) {
  const blocked = externalApisBlockedResponse()
  if (blocked) return blocked
  let body: RegisterBody
  try {
    body = (await request.json()) as RegisterBody
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const emailRaw = typeof body.email === "string" ? body.email.trim() : ""
  const password = typeof body.password === "string" ? body.password : ""
  const full_name = typeof body.full_name === "string" ? body.full_name.trim() : ""
  const phoneRaw = typeof body.phone === "string" ? body.phone.trim() : ""
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

  const contactErr = validateRegisterContact(emailRaw, phoneRaw)
  if (contactErr) {
    return NextResponse.json({ error: contactErr }, { status: 400 })
  }
  if (!password || password.length < 6) {
    return NextResponse.json({ error: "Password must be at least 6 characters." }, { status: 400 })
  }
  if (!full_name) {
    return NextResponse.json({ error: "Enter your full name." }, { status: 400 })
  }

  const resolved = resolveRegisterAuthEmail(emailRaw, phoneRaw)
  const { authEmail, phone, requiresEmailVerification } = resolved

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
      email: authEmail,
      userAgent,
      detail: corridor.ok ? corridor.warning ?? null : corridor.message,
    })
  } catch {
    /* audit best-effort */
  }

  if (!corridor.ok) {
    return NextResponse.json({ error: corridor.message }, { status: 403 })
  }

  const admin = createAdminClient()
  const userMetadata: Record<string, unknown> = {
    full_name,
    ...(phone ? { phone } : {}),
    security_profile_required: true,
    ...(preferred_language ? { preferred_language } : {}),
    ...(preferred_currency ? { preferred_currency } : {}),
  }

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: authEmail,
    password,
    email_confirm: !requiresEmailVerification,
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
      const existingId =
        (await findAuthUserIdByEmail(admin, authEmail)) ??
        (phone ? await resolveExistingUserIdByPhone(admin, phone) : null)
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
              "This account is already registered. Sign in with your password, or use recovery if you need help.",
          },
          { status: 400 },
        )
      }
      if (requiresEmailVerification && emailRaw) {
        const issued = await issueEmailVerificationCode(emailRaw)
        if (!issued.ok) {
          return NextResponse.json({ error: issued.error }, { status: issued.status ?? 400 })
        }
      }
      await grantRegisterWelcomeBonus(admin, existingId)
      return NextResponse.json({
        ok: true,
        requiresEmailVerification,
        email: requiresEmailVerification ? emailRaw.toLowerCase() : undefined,
      })
    } catch (e) {
      console.warn("[register] duplicate resend path:", e instanceof Error ? e.message : String(e))
      return NextResponse.json(
        { error: friendlyRegisterAuthError(createError.message) },
        { status: 400 },
      )
    }
  }

  const newUserId = created.user?.id
  if (newUserId) {
    await grantRegisterWelcomeBonus(admin, newUserId)
    runRegisterPostSignup(admin, {
      userId: newUserId,
      authEmail,
      phone,
      fundingCountryCode: funding_country_code,
      referralInvite,
      campaignSlug,
      userMetadata,
    })

    if (!requiresEmailVerification) {
      const { error: profErr } = await admin
        .from("profiles")
        .update({ is_verified: true })
        .eq("id", newUserId)
      if (profErr) {
        console.warn("[register] phone-only is_verified:", profErr.message)
      }

      const sessionResult = await createAuthSessionForEmail(authEmail)
      if (sessionResult.ok) {
        try {
          const { createRouteHandlerSupabaseClient } = await import("@/lib/supabase/route-handler")
          const supabase = await createRouteHandlerSupabaseClient()
          const { data: sessionData } = await supabase.auth.getSession()
          const accessToken = sessionData.session?.access_token
          if (accessToken) {
            await trackLoginSession({
              userId: sessionResult.userId,
              bearerToken: accessToken,
              userAgent: userAgent ?? "",
              ipAddress: ip,
            })
          }
        } catch (e) {
          console.warn("[register] session track:", e instanceof Error ? e.message : e)
        }
        return NextResponse.json({
          ok: true,
          session: true,
          requiresEmailVerification: false,
        })
      }
    }
  }

  if (requiresEmailVerification && emailRaw) {
    const issued = await issueEmailVerificationCode(emailRaw)
    if (!issued.ok) {
      return NextResponse.json({ error: issued.error }, { status: issued.status ?? 400 })
    }
    return NextResponse.json({
      ok: true,
      requiresEmailVerification: true,
      email: emailRaw.toLowerCase(),
    })
  }

  return NextResponse.json({ ok: true, requiresEmailVerification: false })
}

async function resolveExistingUserIdByPhone(
  admin: ReturnType<typeof createAdminClient>,
  phone: string,
): Promise<string | null> {
  const email = await resolveIdentifierToEmail(admin, phone)
  if (!email) return null
  return findAuthUserIdByEmail(admin, email)
}
