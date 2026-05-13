import { NextResponse } from "next/server"
import { externalApisBlockedResponse } from "@/lib/dev-local-api-guard"
import { createRouteHandlerSupabaseClient } from "@/lib/supabase/route-handler"
import { issueEmailVerificationCode } from "@/lib/email-verification-issue"
import { mergeSafeUserMetadata } from "@/lib/server/auth-jwt-metadata"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { comprefaceEnrollFace, isCompreFaceConfigured } from "@/lib/server/compreface"
import { normalizeReferralCodeInput, referralCodeForUserId } from "@/lib/referral-code"
import { getPublicSiteOrigin } from "@/lib/site-public-url"
import { findAuthUserIdByEmail } from "@/lib/auth-users"

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
  selfie_image?: string
  selfie_template?: string
  selfie_hash?: string
}

/**
 * Supabase Auth signUp + Brevo verification email (see public.email_verifications).
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
  const preferred_currency =
    typeof body.preferred_currency === "string" ? body.preferred_currency.trim().toUpperCase().slice(0, 8) : ""
  const funding_country_raw =
    typeof body.funding_country_code === "string" ? body.funding_country_code.trim().toUpperCase().slice(0, 2) : ""
  const funding_country_code = /^[A-Z]{2}$/.test(funding_country_raw) ? funding_country_raw : ""
  const referralInvite = normalizeReferralCodeInput(
    typeof body.referral_code === "string" ? body.referral_code : ""
  )
  const selfie_image =
    typeof body.selfie_image === "string" ? body.selfie_image.trim() : ""
  const selfie_template =
    typeof body.selfie_template === "string" ? body.selfie_template.trim() : ""
  const selfie_hash =
    typeof body.selfie_hash === "string" ? body.selfie_hash.trim().toLowerCase() : ""

  if (!email || !password) {
    return NextResponse.json({ error: "email and password are required" }, { status: 400 })
  }
  const hasSelfiePayload = Boolean(selfie_image || selfie_template || selfie_hash)
  const hasCompleteSelfiePayload = Boolean(selfie_image && selfie_template && selfie_hash)
  if (hasSelfiePayload && !hasCompleteSelfiePayload) {
    return NextResponse.json(
      { error: "Incomplete selfie payload. Provide image, template, and hash together." },
      { status: 400 }
    )
  }
  if (selfie_image && selfie_image.length > 6_000_000) {
    return NextResponse.json({ error: "Selfie image payload is too large." }, { status: 413 })
  }
  if (selfie_template && !/^[A-Za-z0-9_-]{120,600}$/.test(selfie_template)) {
    return NextResponse.json({ error: "Invalid selfie template." }, { status: 400 })
  }
  if (selfie_hash && !/^[0-9a-f]{16,}$/.test(selfie_hash)) {
    return NextResponse.json({ error: "Invalid selfie identity hash." }, { status: 400 })
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
        ...(hasCompleteSelfiePayload
          ? {
              selfie_hash,
              selfie_template_v1: selfie_template,
              selfie_template_version: "v1",
              selfie_enrolled_at: nowIso,
              security_selfie_enrolled: true,
            }
          : {
              security_selfie_enrolled: false,
            }),
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
        if (rid && rid !== newUserId) referredByUserId = rid
      }

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

      if (funding_country_code) {
        const { error: fcErr } = await admin
          .from("profiles")
          .update({ funding_country_code, updated_at: nowIso })
          .eq("id", newUserId)
        if (fcErr) {
          console.warn("[register] funding_country_code profile update:", fcErr.message)
        }
      }

      if (hasCompleteSelfiePayload) {
        const { error: profileAvatarErr } = await admin
          .from("profiles")
          .update({ avatar_url: null, updated_at: nowIso })
          .eq("id", newUserId)
        if (profileAvatarErr) {
          console.warn("[register] profiles.avatar_url update:", profileAvatarErr.message)
        }
      }
      const meta = (signUpData.user?.user_metadata ?? {}) as Record<string, unknown>
      const { error: metaStripErr } = await admin.auth.admin.updateUserById(newUserId, {
        user_metadata: mergeSafeUserMetadata(meta, {
          ...(hasCompleteSelfiePayload
            ? {
                selfie_hash,
                selfie_template_v1: selfie_template,
                selfie_template_version: "v1",
                selfie_enrolled_at: nowIso,
                security_selfie_enrolled: true,
              }
            : {
                security_selfie_enrolled: false,
              }),
        }),
      })
      if (metaStripErr) {
        console.warn("[register] user_metadata sanitize:", metaStripErr.message)
      }
    } catch (e) {
      console.warn("[register] post-signup profile/metadata:", e instanceof Error ? e.message : String(e))
    }
  }

  // Best-effort enrollment into CompreFace identity store.
  if (newUserId && hasCompleteSelfiePayload && isCompreFaceConfigured()) {
    try {
      await comprefaceEnrollFace(newUserId, selfie_image)
    } catch (e) {
      console.warn("[register] CompreFace enroll warning:", e instanceof Error ? e.message : String(e))
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
