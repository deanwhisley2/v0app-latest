import { NextResponse } from "next/server"
import { bearerUserWithGovernance } from "@/lib/server/account-governance"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { isValidRegisterEmail } from "@/lib/auth/register-contact"
import {
  issueEmailVerificationCodeForUser,
} from "@/lib/email-verification-issue"
import { commitVerifiedProfileEmail, markProfilePendingVerificationEmail } from "@/lib/server/pending-verification-email"
import { PENDING_VERIFICATION_EMAIL_META_KEY } from "@/lib/server/pending-verification-email"

export async function GET(request: Request) {
  try {
    const auth = await bearerUserWithGovernance(request, "read")
    if ("response" in auth) return auth.response
    const { user } = auth
    const admin = createAdminClient()

    const { data: prof } = await admin
      .from("profiles")
      .select("email,is_verified")
      .eq("id", user.id)
      .maybeSingle()

    const meta = (user.user_metadata ?? {}) as Record<string, unknown>
    const pending =
      typeof meta[PENDING_VERIFICATION_EMAIL_META_KEY] === "string"
        ? String(meta[PENDING_VERIFICATION_EMAIL_META_KEY]).trim().toLowerCase()
        : null

    return NextResponse.json({
      isVerified: prof?.is_verified === true,
      profileEmail: prof?.email ?? null,
      pendingEmail: pending,
      authEmail: user.email ?? null,
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Internal error" },
      { status: 500 },
    )
  }
}

export async function POST(request: Request) {
  try {
    const auth = await bearerUserWithGovernance(request, "mutate")
    if ("response" in auth) return auth.response
    const { user } = auth

    const body = (await request.json().catch(() => ({}))) as {
      action?: string
      email?: string
      code?: string
    }
    const action = typeof body.action === "string" ? body.action.trim() : "send"
    const admin = createAdminClient()

    if (action === "verify") {
      const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : ""
      const code = typeof body.code === "string" ? body.code.replace(/\D/g, "").slice(0, 6) : ""
      if (!email || code.length !== 6) {
        return NextResponse.json({ error: "email and 6-digit code are required" }, { status: 400 })
      }

      const nowIso = new Date().toISOString()
      const { data: rows, error: selErr } = await admin
        .from("email_verifications")
        .select("id")
        .eq("user_id", user.id)
        .eq("email", email)
        .eq("code", code)
        .gt("expires_at", nowIso)
        .limit(1)
      if (selErr) throw new Error(selErr.message)
      if (!rows?.length) {
        return NextResponse.json({ error: "Invalid or expired code" }, { status: 400 })
      }

      await commitVerifiedProfileEmail(admin, user.id, email)
      await admin.from("email_verifications").delete().eq("user_id", user.id)

      return NextResponse.json({ ok: true, message: "Email verified." })
    }

    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : ""
    if (!isValidRegisterEmail(email)) {
      return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 })
    }

    await markProfilePendingVerificationEmail(
      admin,
      user.id,
      email,
      (user.user_metadata ?? {}) as Record<string, unknown>,
    )

    const issued = await issueEmailVerificationCodeForUser(user.id, email)
    if (!issued.ok) {
      return NextResponse.json(
        {
          ok: false,
          deferred: true,
          error: issued.error,
          ...(issued.retryAfterSeconds ? { retryAfterSeconds: issued.retryAfterSeconds } : {}),
        },
        { status: issued.status ?? 502 },
      )
    }

    return NextResponse.json({
      ok: true,
      message: "Verification code sent. It usually arrives within one minute.",
      email,
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Internal error" },
      { status: 500 },
    )
  }
}
