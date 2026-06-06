import { NextResponse } from "next/server"
import { externalApisBlockedResponse } from "@/lib/dev-local-api-guard"
import { createRouteHandlerSupabaseClient } from "@/lib/supabase/route-handler"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { findAuthUserIdByEmail } from "@/lib/auth-users"
import { resolveIdentifierToEmail } from "@/lib/server/auth-identifier"
import { confirmAuthEmailForPasswordLogin } from "@/lib/server/register-auth-access"

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

  async function signIn() {
    return supabase.auth.signInWithPassword({
      email: resolvedEmail,
      password,
    })
  }

  let { data, error } = await signIn()

  if (
    error &&
    /email not confirmed|confirm your email/i.test(error.message) &&
    resolvedEmail.includes("@")
  ) {
    try {
      const userId = await findAuthUserIdByEmail(admin, resolvedEmail)
      if (userId && (await confirmAuthEmailForPasswordLogin(admin, userId))) {
        const retry = await signIn()
        data = retry.data
        error = retry.error
      }
    } catch (e) {
      console.warn("[auth/login] email_confirm retry:", e instanceof Error ? e.message : e)
    }
  }

  if (error) {
    const msg = error.message
    const status = msg.toLowerCase().includes("invalid login credentials") ? 401 : 400
    return NextResponse.json({ error: msg }, { status })
  }

  if (!data.session?.user) {
    return NextResponse.json({ error: "No session returned. Try again or contact support." }, { status: 500 })
  }

  let emailVerificationPending = false
  try {
    const { data: prof } = await admin
      .from("profiles")
      .select("is_verified")
      .eq("id", data.user.id)
      .maybeSingle()
    emailVerificationPending = prof?.is_verified !== true
  } catch (e) {
    console.warn("[auth/login] profile read:", e instanceof Error ? e.message : e)
  }

  return NextResponse.json({
    ok: true,
    userId: data.user.id,
    ...(emailVerificationPending ? { emailVerificationPending: true } : {}),
  })
}
