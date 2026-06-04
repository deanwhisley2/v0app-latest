import { createAdminClient } from "@/lib/supabaseAdmin"
import { findAuthUserIdByEmail } from "@/lib/auth-users"
import { sendPasswordResetCodeEmail } from "@/lib/login-code-email"
import { hashLoginCode } from "@/lib/server/magic-link-auth"
import { randomInt, timingSafeEqual } from "crypto"

const TTL_MS = 15 * 60 * 1000
const SEND_COOLDOWN_MS = 120 * 1000

const RESET_SENT_MESSAGE =
  "If an account exists for this email, we sent a 6-digit reset code. Enter it on the reset password page."

const sendChains = new Map<string, Promise<unknown>>()

function enqueueResetSend<T>(emailKey: string, fn: () => Promise<T>): Promise<T> {
  const prev = sendChains.get(emailKey) ?? Promise.resolve()
  const next = prev.then(() => fn())
  sendChains.set(emailKey, next.then(() => {}).catch(() => {}))
  return next as Promise<T>
}

function maskEmail(email: string): string {
  const [local, domain] = email.split("@")
  if (!local || !domain) return email
  const safeLocal =
    local.length <= 2 ? `${local[0] || "*"}*` : `${local[0]}***${local.slice(-1)}`
  return `${safeLocal}@${domain}`
}

function normalizeCode(raw: string): string | null {
  const digits = raw.replace(/\D/g, "")
  if (digits.length !== 6) return null
  return digits
}

export type RequestPasswordResetResult =
  | { ok: true; message: string; maskedEmail?: string }
  | { ok: false; error: string; status: number }

/** Sends branded 6-digit code via Cyberpersons/SMTP — never Supabase default reset email. */
export async function requestPasswordResetCode(params: {
  emailRaw: string
  requestIp: string | null
  userAgent: string | null
}): Promise<RequestPasswordResetResult> {
  const trimmed = params.emailRaw.trim()
  if (!trimmed.includes("@")) {
    return { ok: false, error: "Enter a valid email address.", status: 400 }
  }
  const emailKey = trimmed.toLowerCase()

  return enqueueResetSend(emailKey, async () => {
    const admin = createAdminClient()
    const userId = await findAuthUserIdByEmail(admin, trimmed)

    if (!userId) {
      return { ok: true, message: RESET_SENT_MESSAGE }
    }

    const { data: lastRows, error: lastErr } = await admin
      .from("auth_magic_link_tokens")
      .select("created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)

    if (lastErr) {
      console.error("[password-reset] cooldown read:", lastErr.message)
      return { ok: false, error: "Could not process request.", status: 500 }
    }

    const lastCreated = lastRows?.[0]?.created_at
    if (lastCreated) {
      const elapsed = Date.now() - new Date(lastCreated).getTime()
      if (elapsed < SEND_COOLDOWN_MS) {
        return {
          ok: false,
          error: "Please wait 120 seconds before requesting another code.",
          status: 429,
        }
      }
    }

    const code = randomInt(0, 1_000_000).toString().padStart(6, "0")
    const codeHash = hashLoginCode(code)
    const expiresAt = new Date(Date.now() + TTL_MS).toISOString()

    await admin.from("auth_magic_link_tokens").delete().eq("user_id", userId)

    const { error: insertError } = await admin.from("auth_magic_link_tokens").insert({
      user_id: userId,
      email: emailKey,
      token_hash: codeHash,
      expires_at: expiresAt,
      request_ip: params.requestIp,
      user_agent: params.userAgent,
    })

    if (insertError) {
      console.error("[password-reset] insert:", insertError.message)
      return { ok: false, error: "Could not store reset code.", status: 500 }
    }

    const { data: prof } = await admin
      .from("profiles")
      .select("full_name")
      .eq("id", userId)
      .maybeSingle()
    const displayName = prof?.full_name?.trim() || "Valued Customer"

    try {
      await sendPasswordResetCodeEmail(trimmed, code, displayName)
    } catch (e) {
      await admin.from("auth_magic_link_tokens").delete().eq("user_id", userId)
      const msg = e instanceof Error ? e.message : "Failed to send email"
      return { ok: false, error: msg, status: 502 }
    }

    return {
      ok: true,
      message: RESET_SENT_MESSAGE,
      maskedEmail: maskEmail(trimmed),
    }
  })
}

export type CompletePasswordResetResult =
  | { ok: true }
  | { ok: false; error: string; status: number }

export async function completePasswordResetWithCode(
  emailRaw: string,
  codeRaw: string,
  newPassword: string,
): Promise<CompletePasswordResetResult> {
  const emailKey = emailRaw.trim().toLowerCase()
  if (!emailKey.includes("@")) {
    return { ok: false, error: "Enter the email for your account.", status: 400 }
  }

  const code = normalizeCode(codeRaw)
  if (!code) {
    return { ok: false, error: "Enter the 6-digit code from your email.", status: 400 }
  }

  if (newPassword.length < 10) {
    return { ok: false, error: "Password must be at least 10 characters.", status: 400 }
  }

  const codeHash = hashLoginCode(code)
  const admin = createAdminClient()

  const { data: row, error: fetchErr } = await admin
    .from("auth_magic_link_tokens")
    .select("id, user_id, email, expires_at, consumed_at, token_hash")
    .eq("email", emailKey)
    .eq("token_hash", codeHash)
    .maybeSingle()

  if (fetchErr) {
    console.error("[password-reset] fetch:", fetchErr.message)
    return { ok: false, error: "Could not verify code.", status: 500 }
  }

  if (!row) {
    return { ok: false, error: "Invalid or expired code. Request a new reset code.", status: 401 }
  }

  if (row.consumed_at) {
    return { ok: false, error: "This code was already used. Request a new reset code.", status: 401 }
  }

  if (new Date(row.expires_at).getTime() < Date.now()) {
    return { ok: false, error: "This code has expired. Request a new reset code.", status: 401 }
  }

  const storedHash = Buffer.from(row.token_hash, "hex")
  const providedHash = Buffer.from(codeHash, "hex")
  if (
    storedHash.length !== providedHash.length ||
    !timingSafeEqual(storedHash, providedHash)
  ) {
    return { ok: false, error: "Invalid or expired code. Request a new reset code.", status: 401 }
  }

  const { error: updateErr } = await admin.auth.admin.updateUserById(row.user_id, {
    password: newPassword,
  })

  if (updateErr) {
    console.error("[password-reset] updateUser:", updateErr.message)
    return { ok: false, error: updateErr.message || "Could not update password.", status: 500 }
  }

  const consumedAt = new Date().toISOString()
  await admin
    .from("auth_magic_link_tokens")
    .update({ consumed_at: consumedAt })
    .eq("id", row.id)
    .is("consumed_at", null)

  await admin.from("auth_magic_link_tokens").delete().eq("user_id", row.user_id).is("consumed_at", null)

  return { ok: true }
}
