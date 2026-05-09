import { NextResponse } from "next/server"
import { externalApisBlockedResponse } from "@/lib/dev-local-api-guard"
import { createRouteHandlerSupabaseClient } from "@/lib/supabase/route-handler"
import { issueEmailVerificationCode } from "@/lib/email-verification-issue"
import { mergeSafeUserMetadata } from "@/lib/server/auth-jwt-metadata"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { comprefaceEnrollFace, isCompreFaceConfigured } from "@/lib/server/compreface"

type RegisterBody = {
  email?: string
  password?: string
  full_name?: string
  phone?: string
  preferred_language?: string
  preferred_currency?: string
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
  const selfie_image =
    typeof body.selfie_image === "string" ? body.selfie_image.trim() : ""
  const selfie_template =
    typeof body.selfie_template === "string" ? body.selfie_template.trim() : ""
  const selfie_hash =
    typeof body.selfie_hash === "string" ? body.selfie_hash.trim().toLowerCase() : ""

  if (!email || !password) {
    return NextResponse.json({ error: "email and password are required" }, { status: 400 })
  }
  if (!selfie_image) {
    return NextResponse.json(
      { error: "Security selfie is required at registration." },
      { status: 400 }
    )
  }
  if (selfie_image.length > 6_000_000) {
    return NextResponse.json(
      { error: "Selfie image payload is too large." },
      { status: 413 }
    )
  }
  if (!selfie_template || !/^[A-Za-z0-9_-]{120,600}$/.test(selfie_template)) {
    return NextResponse.json({ error: "Invalid selfie template." }, { status: 400 })
  }
  if (!selfie_hash || !/^[0-9a-f]{16,}$/.test(selfie_hash)) {
    return NextResponse.json(
      { error: "Invalid selfie identity hash." },
      { status: 400 }
    )
  }

  const supabase = await createRouteHandlerSupabaseClient()
  const origin = process.env.NEXT_PUBLIC_SITE_URL?.trim() || new URL(request.url).origin
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
        selfie_hash,
        selfie_template_v1: selfie_template,
        selfie_template_version: "v1",
        selfie_enrolled_at: nowIso,
        security_selfie_enrolled: true,
        ...(preferred_language ? { preferred_language } : {}),
        ...(preferred_currency ? { preferred_currency } : {}),
      },
    },
  })

  if (signUpError) {
    return NextResponse.json({ error: signUpError.message }, { status: 400 })
  }

  const newUserId = signUpData.user?.id
  if (newUserId) {
    try {
      const admin = createAdminClient()
      const { error: profileAvatarErr } = await admin
        .from("profiles")
        .update({ avatar_url: null, updated_at: nowIso })
        .eq("id", newUserId)
      if (profileAvatarErr) {
        console.warn("[register] profiles.avatar_url update:", profileAvatarErr.message)
      }
      const meta = (signUpData.user?.user_metadata ?? {}) as Record<string, unknown>
      const { error: metaStripErr } = await admin.auth.admin.updateUserById(newUserId, {
        user_metadata: mergeSafeUserMetadata(meta, {
          selfie_hash,
          selfie_template_v1: selfie_template,
          selfie_template_version: "v1",
          selfie_enrolled_at: nowIso,
          security_selfie_enrolled: true,
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
  if (newUserId && isCompreFaceConfigured()) {
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
