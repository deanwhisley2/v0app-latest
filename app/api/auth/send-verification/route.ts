import { NextResponse } from "next/server"
import { issueEmailVerificationCode } from "@/lib/email-verification-issue"

/** Brevo sends the message; codes live in public.email_verifications (service role). */

export async function POST(req: Request) {
  let email: string | undefined
  try {
    const body = await req.json()
    email = typeof body.email === "string" ? body.email.trim() : undefined
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  if (!email) {
    return NextResponse.json({ error: "email is required" }, { status: 400 })
  }

  const result = await issueEmailVerificationCode(email)

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status ?? 400 }
    )
  }

  if (result.ambiguous) {
    return NextResponse.json({
      ok: true,
      message: "If an account exists for this email, a code was sent.",
    })
  }

  return NextResponse.json({ message: "Verification code sent" })
}
