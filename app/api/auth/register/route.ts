import { NextResponse } from "next/server"
import { externalApisBlockedResponse } from "@/lib/dev-local-api-guard"
import { createRouteHandlerSupabaseClient } from "@/lib/supabase/route-handler"
import { issueEmailVerificationCode } from "@/lib/email-verification-issue"
import { comprefaceEnrollFace, isCompreFaceConfigured } from "@/lib/server/compreface"

type RegisterBody = {
  email?: string
  password?: string
  full_name?: string
  phone?: string
  preferred_language?: string
  preferred_currency?: string
  avatar_url?: string
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
  const avatar_url =
    typeof body.avatar_url === "string" ? body.avatar_url.trim() : ""
  const selfie_hash =
    typeof body.selfie_hash === "string" ? body.selfie_hash.trim().toLowerCase() : ""

  if (!email || !password) {
    return NextResponse.json({ error: "email and password are required" }, { status: 400 })
  }
  if (!avatar_url) {
    return NextResponse.json(
      { error: "Security selfie is required at registration." },
      { status: 400 }
    )
  }
  if (avatar_url.length > 6_000_000) {
    return NextResponse.json(
      { error: "Selfie image payload is too large." },
      { status: 413 }
    )
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

  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo,
      data: {
        full_name,
        phone,
        avatar_url,
        selfie_hash,
        selfie_enrolled_at: new Date().toISOString(),
        ...(preferred_language ? { preferred_language } : {}),
        ...(preferred_currency ? { preferred_currency } : {}),
      },
    },
  })

  if (signUpError) {
    return NextResponse.json({ error: signUpError.message }, { status: 400 })
  }

  // Best-effort enrollment into CompreFace identity store.
  const newUserId = signUpData.user?.id
  if (newUserId && isCompreFaceConfigured()) {
    try {
      await comprefaceEnrollFace(newUserId, avatar_url)
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
