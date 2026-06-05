import { randomInt } from "crypto"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { findAuthUserIdByEmail } from "@/lib/auth-users"
import { sendTransactionalVerificationEmail } from "@/lib/server/transactional-email"

const VERIFY_TTL_MS = 15 * 60 * 1000
export const EMAIL_VERIFICATION_SEND_COOLDOWN_MS = 60 * 1000

const COOLDOWN_ERROR = "Please wait 60 seconds before requesting another code."

const sendChains = new Map<string, Promise<unknown>>()

function enqueueVerificationSend<T>(emailKey: string, fn: () => Promise<T>): Promise<T> {
  const prev = sendChains.get(emailKey) ?? Promise.resolve()
  const next = prev.then(() => fn())
  sendChains.set(emailKey, next.then(() => {}).catch(() => {}))
  return next as Promise<T>
}

export type IssueVerificationResult =
  | { ok: true; ambiguous: true }
  | { ok: true; ambiguous?: false }
  | { ok: false; error: string; status?: number; retryAfterSeconds?: number }

/**
 * Stores a code in public.email_verifications (service role) and sends it via Brevo SMTP.
 */
export async function issueEmailVerificationCodeForUser(
  userId: string,
  emailRaw: string,
): Promise<IssueVerificationResult> {
  const trimmed = emailRaw.trim()
  const emailKey = trimmed.toLowerCase()

  return enqueueVerificationSend(`${userId}:${emailKey}`, async () => {
    const admin = createAdminClient()
    return issueVerificationCodeInner(admin, userId, trimmed, emailKey)
  })
}

export async function issueEmailVerificationCode(
  emailRaw: string
): Promise<IssueVerificationResult> {
  const trimmed = emailRaw.trim()
  const emailKey = trimmed.toLowerCase()

  return enqueueVerificationSend(emailKey, async () => {
    const admin = createAdminClient()
    const userId = await findAuthUserIdByEmail(admin, trimmed)

    if (!userId) {
      return { ok: true, ambiguous: true }
    }

    return issueVerificationCodeInner(admin, userId, trimmed, emailKey)
  })
}

async function issueVerificationCodeInner(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  trimmed: string,
  emailKey: string,
): Promise<IssueVerificationResult> {

  const { data: lastRows, error: lastErr } = await admin
      .from("email_verifications")
      .select("created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)

    if (lastErr) {
      console.error("email_verifications cooldown read:", lastErr)
      return {
        ok: false,
        error: "Could not check send rate limit",
        status: 500,
      }
    }

    const lastCreated = lastRows?.[0]?.created_at
    if (lastCreated) {
      const elapsed = Date.now() - new Date(lastCreated).getTime()
      if (elapsed < EMAIL_VERIFICATION_SEND_COOLDOWN_MS) {
        const retryAfterSeconds = Math.ceil(
          (EMAIL_VERIFICATION_SEND_COOLDOWN_MS - elapsed) / 1000,
        )
        return {
          ok: false,
          error: COOLDOWN_ERROR,
          status: 429,
          retryAfterSeconds,
        }
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
      return {
        ok: false,
        error: "Could not store verification code",
        status: 500,
      }
    }

    const { data: prof } = await admin
      .from("profiles")
      .select("full_name")
      .eq("id", userId)
      .maybeSingle()
    const displayName = prof?.full_name?.trim() || "Valued Customer"

    try {
      await sendTransactionalVerificationEmail(trimmed, code, displayName)
    } catch (e) {
      await admin.from("email_verifications").delete().eq("user_id", userId)
      const msg = e instanceof Error ? e.message : "Failed to send email"
      return { ok: false, error: msg, status: 502 }
    }

  return { ok: true, ambiguous: false }
}
