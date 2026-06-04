import { NextResponse } from "next/server"
import { externalApisBlockedResponse } from "@/lib/dev-local-api-guard"
import { createRouteHandlerSupabaseClient } from "@/lib/supabase/route-handler"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { resolveIdentifierToEmail } from "@/lib/server/auth-identifier"
import { userCanAccessWithoutEmailVerification } from "@/lib/server/pending-verification-email"

type LoginBody = {
  email?: string
  password?: string
}

/**
 * Server-side sign-in so Supabase auth cookies are written via Next.js cookie store
 * (reliable on new devices/browsers). Client should hard-navigate to /dashboard after ok.
 */
export async function POST(request: Request) {
  const blocked = externalApisBlockedResponse()
  if (blocked) return blocked

  let body: LoginBody
  try {
    body = (await request.json()) as LoginBody
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const identifier = typeof body.email === "string" ? body.email.trim() : ""
  const password = typeof body.password === "string" ? body.password : ""
  if (!identifier || !password) {
    return NextResponse.json({ error: "Email or phone and password are required." }, { status: 400 })
  }

  const admin = createAdminClient()
  const resolvedEmail = (await resolveIdentifierToEmail(admin, identifier)) ?? identifier
  const supabase = await createRouteHandlerSupabaseClient()
  const { data, error } = await supabase.auth.signInWithPassword({
    email: resolvedEmail,
    password,
  })

  if (error) {
    const msg = error.message
    const status = msg.toLowerCase().includes("invalid login credentials") ? 401 : 400
    return NextResponse.json({ error: msg }, { status })
  }

  if (!data.session?.user) {
    return NextResponse.json({ error: "No session returned. Try again or contact support." }, { status: 500 })
  }

  try {
    const canAccess = await userCanAccessWithoutEmailVerification(admin, data.user.id)
    if (!canAccess) {
      const pending =
        typeof data.user.user_metadata?.pending_verification_email === "string"
          ? data.user.user_metadata.pending_verification_email
          : resolvedEmail
      return NextResponse.json(
        {
          error: "Verify your email with the 6-digit code we sent before signing in.",
          code: "EMAIL_NOT_VERIFIED",
          email: pending,
        },
        { status: 403 },
      )
    }
  } catch (e) {
    console.warn("[auth/login] profile gate:", e instanceof Error ? e.message : e)
  }

  return NextResponse.json({ ok: true, userId: data.user.id })
}
