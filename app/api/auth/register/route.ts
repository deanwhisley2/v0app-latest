import { NextResponse } from "next/server"
import { createRouteHandlerSupabaseClient } from "@/lib/supabase/route-handler"
import { issueEmailVerificationCode } from "@/lib/email-verification-issue"

type RegisterBody = {
  email?: string
  password?: string
  full_name?: string
  phone?: string
}

/**
 * Supabase Auth signUp + Brevo verification email (see public.email_verifications).
 * Disable “Confirm email” in Supabase Auth to avoid duplicate mails from Auth SMTP.
 */
export async function POST(request: Request) {
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

  if (!email || !password) {
    return NextResponse.json({ error: "email and password are required" }, { status: 400 })
  }

  const supabase = await createRouteHandlerSupabaseClient()
  const origin = new URL(request.url).origin
  const emailRedirectTo = `${origin}/auth/verify`

  const { error: signUpError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo,
      data: {
        full_name,
        phone,
      },
    },
  })

  if (signUpError) {
    return NextResponse.json({ error: signUpError.message }, { status: 400 })
  }

  const issued = await issueEmailVerificationCode(email)
  if (!issued.ok) {
    return NextResponse.json(
      { error: issued.error },
      { status: issued.status ?? 400 }
    )
  }

  await supabase.auth.signOut()

  const verify = new URL("/auth/verify", request.url)
  verify.searchParams.set("email", email)
  return NextResponse.redirect(verify, 303)
}
