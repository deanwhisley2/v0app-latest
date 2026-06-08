import { NextResponse } from "next/server"
import { externalApisBlockedResponse } from "@/lib/dev-local-api-guard"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { normalizeReferralCodeInput } from "@/lib/referral-code"
import { findAuthUserIdByEmail } from "@/lib/auth-users"
import { displayCurrencyForCustomer } from "@/lib/customer-display-currency"
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
import {
  authEmailConfirmedAtRegister,
  confirmAuthEmailForPasswordLogin,
} from "@/lib/server/register-auth-access"
import { syncRegisterProfileContact } from "@/lib/server/register-profile-sync"
import { setupSecurityProfile } from "@/lib/server/user-security-profile-service"

/** Default corridor when signup no longer asks for country (UG-first product). */
const DEFAULT_FUNDING_COUNTRY = "UG"

type RegisterBody = {
  phone?: string
  password?: string
  full_name?: string
  security_pin?: string
  preferred_language?: string
  preferred_currency?: string
  referral_code?: string
  campaign_slug?: string
  /** Legacy fields — ignored for new phone-only signups */
  email?: string
  funding_country_code?: string
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

  const phoneRaw = typeof body.phone === "string" ? body.phone.trim() : ""
  const password = typeof body.password === "string" ? body.password : ""
  const full_name = typeof body.full_name === "string" ? body.full_name.trim() : ""
  const securityPin = typeof body.security_pin === "string" ? body.security_pin.trim() : ""
  const preferred_language =
    typeof body.preferred_language === "string" ? body.preferred_language.trim().slice(0, 12) : ""
  const preferred_currency_raw =
    typeof body.preferred_currency === "string" ? body.preferred_currency.trim().toUpperCase().slice(0, 8) : ""
  const preferred_currency = displayCurrencyForCustomer(DEFAULT_FUNDING_COUNTRY, preferred_currency_raw || null)
  const referralInvite = normalizeReferralCodeInput(
    typeof body.referral_code === "string" ? body.referral_code : "",
  )
  const campaignSlug = normalizeCampaignSlugInput(
    typeof body.campaign_slug === "string" ? body.campaign_slug : "",
  )

  const contactErr = validateRegisterContact(phoneRaw, securityPin)
  if (contactErr) {
    return NextResponse.json({ error: contactErr }, { status: 400 })
  }
  if (!password || password.length < 6) {
    return NextResponse.json({ error: "Password must be at least 6 characters." }, { status: 400 })
  }
  if (!full_name) {
    return NextResponse.json({ error: "Enter your full name." }, { status: 400 })
  }

  const resolved = resolveRegisterAuthEmail(phoneRaw)
  const { authEmail, phone } = resolved

  const admin = createAdminClient()
  const ip = getRequestIpAddress(request)
  const userAgent = request.headers.get("user-agent")

  const userMetadata: Record<string, unknown> = {
    full_name,
    phone,
    security_profile_required: false,
    phone_signup: true,
    ...(preferred_language ? { preferred_language } : {}),
    ...(preferred_currency ? { preferred_currency } : {}),
  }

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: authEmail,
    password,
    email_confirm: authEmailConfirmedAtRegister(false, phone),
    user_metadata: userMetadata,
  })

  if (createError) {
    if (!isAuthDuplicateSignupError(createError)) {
      return NextResponse.json(
        { error: friendlyRegisterAuthError(createError.message) },
        { status: 400 },
      )
    }
    const existingId =
      (await findAuthUserIdByEmail(admin, authEmail)) ??
      (await resolveExistingUserIdByPhone(admin, phone))
    return NextResponse.json(
      {
        error:
          "This phone number is already registered. Sign in with your password, or contact support if you need help.",
      },
      { status: 400 },
    )
  }

  const newUserId = created.user?.id
  if (!newUserId) {
    return NextResponse.json({ error: "Account was not created. Try again." }, { status: 500 })
  }

  await syncRegisterProfileContact(admin, newUserId, {
    phone,
    full_name,
    funding_country_code: DEFAULT_FUNDING_COUNTRY,
  })

  try {
    await setupSecurityProfile(admin, {
      userId: newUserId,
      securityCode: securityPin,
      payoutMethod: "mobile_money",
    })
  } catch (pinErr) {
    console.error("[register] security PIN:", pinErr)
    try {
      await admin.auth.admin.deleteUser(newUserId)
    } catch {
      /* best-effort rollback */
    }
    return NextResponse.json(
      {
        error:
          pinErr instanceof Error ? pinErr.message : "Could not save your Security PIN. Try again.",
      },
      { status: 400 },
    )
  }

  await confirmAuthEmailForPasswordLogin(admin, newUserId)

  const { error: profErr } = await admin
    .from("profiles")
    .update({ is_verified: true })
    .eq("id", newUserId)
  if (profErr) {
    console.warn("[register] is_verified:", profErr.message)
  }

  await grantRegisterWelcomeBonus(admin, newUserId)
  runRegisterPostSignup(admin, {
    userId: newUserId,
    authEmail,
    phone,
    fundingCountryCode: DEFAULT_FUNDING_COUNTRY,
    referralInvite,
    campaignSlug,
    userMetadata,
  })

  const sessionGranted = await grantRegisterAuthSession({
    authEmail,
    userId: newUserId,
    userAgent: userAgent ?? "",
    ipAddress: ip,
  })

  if (!sessionGranted) {
    return NextResponse.json({
      ok: true,
      session: false,
      message: "Account created. Sign in with your phone number and password.",
    })
  }

  return NextResponse.json({
    ok: true,
    session: true,
    requiresEmailVerification: false,
  })
}

async function resolveExistingUserIdByPhone(
  admin: ReturnType<typeof createAdminClient>,
  phone: string,
): Promise<string | null> {
  const email = await resolveIdentifierToEmail(admin, phone)
  if (!email) return null
  return findAuthUserIdByEmail(admin, email)
}

async function grantRegisterAuthSession(params: {
  authEmail: string
  userId: string
  userAgent: string
  ipAddress: string | null
}): Promise<boolean> {
  const sessionResult = await createAuthSessionForEmail(params.authEmail)
  if (!sessionResult.ok) return false
  try {
    const { createRouteHandlerSupabaseClient } = await import("@/lib/supabase/route-handler")
    const supabase = await createRouteHandlerSupabaseClient()
    const { data: sessionData } = await supabase.auth.getSession()
    const accessToken = sessionData.session?.access_token
    if (accessToken) {
      await trackLoginSession({
        userId: sessionResult.userId,
        bearerToken: accessToken,
        userAgent: params.userAgent,
        ipAddress: params.ipAddress,
      })
    }
  } catch (e) {
    console.warn("[register] session track:", e instanceof Error ? e.message : e)
  }
  return true
}
