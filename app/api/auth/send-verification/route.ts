import { NextResponse } from "next/server"
import { randomInt } from "crypto"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { sendVerificationEmail } from "@/lib/email"
import { findAuthUserIdByEmail } from "@/lib/auth-users"
import { getUserFromBearer } from "@/lib/auth-api"

const VERIFY_TTL_MS = 15 * 60 * 1000

/** Minimum time between verification emails for the same user (matches user-facing copy). */
const SEND_COOLDOWN_MS = 120 * 1000
const COOLDOWN_ERROR =
  "Please wait 120 seconds before requesting another code."

/** Serialize verification sends per email so cooldown checks and writes stay ordered. */
const sendChains = new Map<string, Promise<unknown>>()

function enqueueVerificationSend<T>(emailKey: string, fn: () => Promise<T>): Promise<T> {
  const prev = sendChains.get(emailKey) ?? Promise.resolve()
  const next = prev.then(() => fn())
  sendChains.set(emailKey, next.then(() => {}).catch(() => {}))
  return next as Promise<T>
}

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

    const emailKey = email.toLowerCase()

    return await enqueueVerificationSend(emailKey, async () => {
      const bearerUser = await getUserFromBearer(request)
      if (bearerUser?.email && bearerUser.email.toLowerCase() !== emailKey) {
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

      const { data: lastRows, error: lastErr } = await admin
        .from("email_verifications")
        .select("created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)

      if (lastErr) {
        console.error("send-verification cooldown read:", lastErr)
        return NextResponse.json({ error: "Could not check send rate limit" }, { status: 500 })
      }

      const lastCreated = lastRows?.[0]?.created_at
      if (lastCreated) {
        const elapsed = Date.now() - new Date(lastCreated).getTime()
        if (elapsed < SEND_COOLDOWN_MS) {
          return NextResponse.json({ error: COOLDOWN_ERROR }, { status: 429 })
        }
      }

      const code = randomInt(0, 1_000_000).toString().padStart(6, "0")
      const expiresAt = new Date(Date.now() + VERIFY_TTL_MS).toISOString()

      await admin.from("email_verifications").delete().eq("user_id", userId)

      const { error: insertError } = await admin.from("email_verifications").insert({
        user_id: userId,
        email: emailKey,
        code,
        expires_at: expiresAt,
      })

      if (insertError) {
        console.error("email_verifications insert:", insertError)
        return NextResponse.json({ error: "Could not store verification code" }, { status: 500 })
      }

      await sendVerificationEmail(email, code)

      return NextResponse.json({ ok: true, message: "Verification code sent." })
    })
  } catch (e) {
    console.error("send-verification:", e)
    const msg = e instanceof Error ? e.message : "Internal error"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
