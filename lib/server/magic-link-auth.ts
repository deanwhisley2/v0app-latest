import { createHash, randomInt, timingSafeEqual } from "crypto"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { findAuthUserIdByEmail } from "@/lib/auth-users"
import { sendLoginCodeEmail } from "@/lib/login-code-email"
import { logAuthEmailDeliveryEvent } from "@/lib/server/auth-email-delivery-log"
import { createRouteHandlerSupabaseClient } from "@/lib/supabase/route-handler"

const TTL_MS = 15 * 60 * 1000
const SEND_COOLDOWN_MS = 120 * 1000
const GENERIC_SENT_MESSAGE =
  "If an account exists for this email, we sent a 6-digit sign-in code. It usually arrives within one minute."

const sendChains = new Map<string, Promise<unknown>>()

function enqueueLoginCodeSend<T>(emailKey: string, fn: () => Promise<T>): Promise<T> {
  const prev = sendChains.get(emailKey) ?? Promise.resolve()
  const next = prev.then(() => fn())
  sendChains.set(emailKey, next.then(() => {}).catch(() => {}))
  return next as Promise<T>
}

export function hashLoginCode(rawCode: string): string {
  const normalized = rawCode.replace(/\D/g, "").padStart(6, "0").slice(-6)
  return createHash("sha256").update(normalized, "utf8").digest("hex")
}

function normalizeLoginCodeInput(raw: string): string | null {
  const digits = raw.replace(/\D/g, "")
  if (digits.length !== 6) return null
  return digits
}

function maskEmail(email: string): string {
  const [local, domain] = email.split("@")
  if (!local || !domain) return email
  const safeLocal =
    local.length <= 2 ? `${local[0] || "*"}*` : `${local[0]}***${local.slice(-1)}`
  return `${safeLocal}@${domain}`
}

export type RequestMagicLinkResult =
  | { ok: true; message: string; maskedEmail?: string }
  | { ok: false; error: string; status: number }

/** @deprecated name kept for API route — sends a 6-digit login code (no URL). */
export async function requestMagicLink(params: {
  emailRaw: string
  requestUrl: string
  requestIp: string | null
  userAgent: string | null
}): Promise<RequestMagicLinkResult> {
  const trimmed = params.emailRaw.trim()
  if (!trimmed.includes("@")) {
    return { ok: false, error: "Enter a valid email address.", status: 400 }
  }
  const emailKey = trimmed.toLowerCase()

  return enqueueLoginCodeSend(emailKey, async () => {
    const admin = createAdminClient()
    const userId = await findAuthUserIdByEmail(admin, trimmed)

    if (!userId) {
      await logAuthEmailDeliveryEvent({
        channel: "magic_link",
        outcome: "skipped",
        email: trimmed,
        ipAddress: params.requestIp,
        userAgent: params.userAgent,
      })
      return { ok: true, message: GENERIC_SENT_MESSAGE }
    }

    const { data: lastRows, error: lastErr } = await admin
      .from("auth_magic_link_tokens")
      .select("created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)

    if (lastErr) {
      console.error("[login-code] cooldown read:", lastErr.message)
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
      console.error("[login-code] insert:", insertError.message)
      return { ok: false, error: "Could not store sign-in code.", status: 500 }
    }

    const { data: prof } = await admin
      .from("profiles")
      .select("full_name")
      .eq("id", userId)
      .maybeSingle()
    const displayName = prof?.full_name?.trim() || "Valued Customer"

    try {
      const { messageId } = await sendLoginCodeEmail(trimmed, code, displayName)
      await logAuthEmailDeliveryEvent({
        channel: "magic_link",
        outcome: "sent",
        email: trimmed,
        userId,
        messageId,
        ipAddress: params.requestIp,
        userAgent: params.userAgent,
      })
    } catch (e) {
      await admin.from("auth_magic_link_tokens").delete().eq("user_id", userId)
      const msg = e instanceof Error ? e.message : "Failed to send email"
      await logAuthEmailDeliveryEvent({
        channel: "magic_link",
        outcome: "failed",
        email: trimmed,
        userId,
        errorMessage: msg,
        ipAddress: params.requestIp,
        userAgent: params.userAgent,
      })
      return { ok: false, error: msg, status: 502 }
    }

    return {
      ok: true,
      message: GENERIC_SENT_MESSAGE,
      maskedEmail: maskEmail(trimmed),
    }
  })
}

export type VerifyMagicLinkResult =
  | { ok: true; userId: string }
  | { ok: false; error: string; status: number }

export async function verifyLoginCodeAndCreateSession(
  emailRaw: string,
  codeRaw: string,
): Promise<VerifyMagicLinkResult> {
  const emailKey = emailRaw.trim().toLowerCase()
  if (!emailKey.includes("@")) {
    return { ok: false, error: "Enter the email you used to request the code.", status: 400 }
  }

  const code = normalizeLoginCodeInput(codeRaw)
  if (!code) {
    return { ok: false, error: "Enter the 6-digit code from your email.", status: 400 }
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
    console.error("[login-code] fetch:", fetchErr.message)
    return { ok: false, error: "Could not verify code.", status: 500 }
  }

  if (!row) {
    return { ok: false, error: "Invalid or expired code. Request a new code.", status: 401 }
  }

  if (row.consumed_at) {
    return { ok: false, error: "This code was already used. Request a new code.", status: 401 }
  }

  if (new Date(row.expires_at).getTime() < Date.now()) {
    return { ok: false, error: "This code has expired. Request a new code.", status: 401 }
  }

  const storedHash = Buffer.from(row.token_hash, "hex")
  const providedHash = Buffer.from(codeHash, "hex")
  if (
    storedHash.length !== providedHash.length ||
    !timingSafeEqual(storedHash, providedHash)
  ) {
    return { ok: false, error: "Invalid or expired code. Request a new code.", status: 401 }
  }

  const email = row.email.trim()

  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  })

  if (linkError || !linkData?.properties?.hashed_token) {
    console.error("[login-code] generateLink:", linkError?.message)
    return { ok: false, error: "Could not start session.", status: 500 }
  }

  const supabase = await createRouteHandlerSupabaseClient()
  const { data: authData, error: verifyError } = await supabase.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: "email",
  })

  if (verifyError || !authData.session?.user) {
    console.error("[login-code] verifyOtp:", verifyError?.message)
    return { ok: false, error: "Could not complete sign-in.", status: 500 }
  }

  const consumedAt = new Date().toISOString()
  await admin
    .from("auth_magic_link_tokens")
    .update({ consumed_at: consumedAt })
    .eq("id", row.id)
    .is("consumed_at", null)

  await admin.from("auth_magic_link_tokens").delete().eq("user_id", row.user_id).is("consumed_at", null)

  return { ok: true, userId: authData.session.user.id }
}

/** Legacy token-in-URL verify — redirects users to enter code on login instead. */
export async function verifyMagicLinkAndCreateSession(rawToken: string): Promise<VerifyMagicLinkResult> {
  void rawToken
  return {
    ok: false,
    error: "Sign-in links are no longer used. Enter the 6-digit code from your email on the login page.",
    status: 400,
  }
}
