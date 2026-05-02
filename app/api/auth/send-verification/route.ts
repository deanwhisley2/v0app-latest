import { NextResponse } from "next/server"
import { randomInt } from "crypto"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { sendVerificationEmail } from "@/lib/email"
import { findAuthUserIdByEmail } from "@/lib/auth-users"
import { getUserFromBearer } from "@/lib/auth-api"

const VERIFY_TTL_MS = 15 * 60 * 1000

export async function POST(request: Request) {
  try {
    let email: string | undefined
    try {
      const body = await request.json()
      email = typeof body.email === "string" ? body.email.trim() : undefined
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }

    if (!email) {
      return NextResponse.json({ error: "email is required" }, { status: 400 })
    }

    const bearerUser = await getUserFromBearer(request)
    if (bearerUser?.email && bearerUser.email.toLowerCase() !== email.toLowerCase()) {
      return NextResponse.json({ error: "Email does not match signed-in user" }, { status: 403 })
    }

    const admin = createAdminClient()
    const userId = await findAuthUserIdByEmail(admin, email)
    if (!userId) {
      return NextResponse.json(
        { ok: true, message: "If an account exists for this email, a code was sent." },
        { status: 200 }
      )
    }

    const code = randomInt(0, 1_000_000).toString().padStart(6, "0")
    const expiresAt = new Date(Date.now() + VERIFY_TTL_MS).toISOString()

    await admin.from("email_verifications").delete().eq("user_id", userId)

    const { error: insertError } = await admin.from("email_verifications").insert({
      user_id: userId,
      email: email.toLowerCase(),
      code,
      expires_at: expiresAt,
    })

    if (insertError) {
      console.error("email_verifications insert:", insertError)
      return NextResponse.json({ error: "Could not store verification code" }, { status: 500 })
    }

    await sendVerificationEmail(email, code)

    return NextResponse.json({ ok: true, message: "Verification code sent." })
  } catch (e) {
    console.error("send-verification:", e)
    const msg = e instanceof Error ? e.message : "Internal error"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
