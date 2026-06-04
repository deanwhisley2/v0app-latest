import { createHash, randomBytes, timingSafeEqual } from "crypto"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { findAuthUserIdByEmail } from "@/lib/auth-users"
import { getPublicSiteOrigin } from "@/lib/site-public-url"
import { sendSmtpMail } from "@/lib/server/smtp-mail"
import { createRouteHandlerSupabaseClient } from "@/lib/supabase/route-handler"

const TOKEN_BYTES = 32
const TTL_MS = 15 * 60 * 1000
const SEND_COOLDOWN_MS = 120 * 1000
const GENERIC_SENT_MESSAGE =
  "If an account exists for this email, we sent a sign-in link. Check your inbox and spam folder."

const sendChains = new Map<string, Promise<unknown>>()

function enqueueMagicLinkSend<T>(emailKey: string, fn: () => Promise<T>): Promise<T> {
  const prev = sendChains.get(emailKey) ?? Promise.resolve()
  const next = prev.then(() => fn())
  sendChains.set(emailKey, next.then(() => {}).catch(() => {}))
  return next as Promise<T>
}

export function hashMagicLinkToken(rawToken: string): string {
  return createHash("sha256").update(rawToken, "utf8").digest("hex")
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function maskEmail(email: string): string {
  const [local, domain] = email.split("@")
  if (!local || !domain) return email
  const safeLocal =
    local.length <= 2 ? `${local[0] || "*"}*` : `${local[0]}***${local.slice(-1)}`
  return `${safeLocal}@${domain}`
}

async function sendMagicLinkEmail(params: {
  to: string
  fullName: string
  magicUrl: string
}): Promise<void> {
  const safeName = escapeHtml(params.fullName.trim() || "Valued Customer")
  const safeUrl = escapeHtml(params.magicUrl)

  await sendSmtpMail({
    to: params.to,
    subject: "Sign in to Nexus Pro",
    html: `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #0ea5e9 0%, #2563eb 100%); padding: 28px; text-align: center; border-radius: 10px 10px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 26px;">Nexus Pro</h1>
    <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0;">Secure sign-in link</p>
  </div>
  <div style="background: #fff; padding: 28px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 10px 10px;">
    <h2 style="color: #333; margin-top: 0;">Sign in without a password</h2>
    <p>Hello <strong>${safeName}</strong>,</p>
    <p>Click the button below to open your dashboard. This link expires in <strong>15 minutes</strong> and works once.</p>
    <p style="text-align:center; margin: 24px 0;">
      <a href="${safeUrl}" style="display:inline-block; background:#2563eb; color:#fff; text-decoration:none; padding:14px 24px; border-radius:8px; font-weight:600;">
        Sign in to Nexus Pro
      </a>
    </p>
    <p style="word-break:break-all; font-size:12px; color:#666;">Or copy this link:<br>${safeUrl}</p>
    <p style="color:#666; font-size:14px;">If you did not request this, ignore this email.</p>
  </div>
</body></html>`,
    text: `Sign in to Nexus Pro\n\nOpen this link (expires in 15 minutes, one-time use):\n${params.magicUrl}\n\nIf you did not request this, ignore this email.`,
  })
}

export type RequestMagicLinkResult =
  | { ok: true; message: string; maskedEmail?: string }
  | { ok: false; error: string; status: number }

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

  return enqueueMagicLinkSend(emailKey, async () => {
    const admin = createAdminClient()
    const userId = await findAuthUserIdByEmail(admin, trimmed)

    if (!userId) {
      return { ok: true, message: GENERIC_SENT_MESSAGE }
    }

    const { data: lastRows, error: lastErr } = await admin
      .from("auth_magic_link_tokens")
      .select("created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)

    if (lastErr) {
      console.error("[magic-link] cooldown read:", lastErr.message)
      return { ok: false, error: "Could not process request.", status: 500 }
    }

    const lastCreated = lastRows?.[0]?.created_at
    if (lastCreated) {
      const elapsed = Date.now() - new Date(lastCreated).getTime()
      if (elapsed < SEND_COOLDOWN_MS) {
        return {
          ok: false,
          error: "Please wait 120 seconds before requesting another link.",
          status: 429,
        }
      }
    }

    const rawToken = randomBytes(TOKEN_BYTES).toString("base64url")
    const tokenHash = hashMagicLinkToken(rawToken)
    const expiresAt = new Date(Date.now() + TTL_MS).toISOString()

    await admin.from("auth_magic_link_tokens").delete().eq("user_id", userId)

    const { error: insertError } = await admin.from("auth_magic_link_tokens").insert({
      user_id: userId,
      email: emailKey,
      token_hash: tokenHash,
      expires_at: expiresAt,
      request_ip: params.requestIp,
      user_agent: params.userAgent,
    })

    if (insertError) {
      console.error("[magic-link] insert:", insertError.message)
      return { ok: false, error: "Could not store sign-in token.", status: 500 }
    }

    const siteBase = getPublicSiteOrigin(params.requestUrl)
    const magicUrl = `${siteBase}/auth/magic?token=${encodeURIComponent(rawToken)}`

    const { data: prof } = await admin
      .from("profiles")
      .select("full_name")
      .eq("id", userId)
      .maybeSingle()
    const displayName = prof?.full_name?.trim() || "Valued Customer"

    try {
      await sendMagicLinkEmail({ to: trimmed, fullName: displayName, magicUrl })
    } catch (e) {
      await admin.from("auth_magic_link_tokens").delete().eq("user_id", userId)
      const msg = e instanceof Error ? e.message : "Failed to send email"
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

export async function verifyMagicLinkAndCreateSession(rawToken: string): Promise<VerifyMagicLinkResult> {
  const token = rawToken.trim()
  if (!token || token.length < 16) {
    return { ok: false, error: "Invalid or missing sign-in link.", status: 400 }
  }

  const tokenHash = hashMagicLinkToken(token)
  const admin = createAdminClient()

  const { data: row, error: fetchErr } = await admin
    .from("auth_magic_link_tokens")
    .select("id, user_id, email, expires_at, consumed_at, token_hash")
    .eq("token_hash", tokenHash)
    .maybeSingle()

  if (fetchErr) {
    console.error("[magic-link] fetch:", fetchErr.message)
    return { ok: false, error: "Could not verify link.", status: 500 }
  }

  if (!row) {
    return { ok: false, error: "This sign-in link is invalid or has expired.", status: 401 }
  }

  const storedHash = Buffer.from(row.token_hash, "hex")
  const providedHash = Buffer.from(tokenHash, "hex")
  if (
    storedHash.length !== providedHash.length ||
    !timingSafeEqual(storedHash, providedHash)
  ) {
    return { ok: false, error: "This sign-in link is invalid or has expired.", status: 401 }
  }

  if (row.consumed_at) {
    return { ok: false, error: "This sign-in link was already used.", status: 401 }
  }

  if (new Date(row.expires_at).getTime() < Date.now()) {
    return { ok: false, error: "This sign-in link has expired.", status: 401 }
  }

  const email = row.email.trim()

  const { data: profile, error: profErr } = await admin
    .from("profiles")
    .select("is_verified")
    .eq("id", row.user_id)
    .maybeSingle()

  if (profErr) {
    console.warn("[magic-link] profile check:", profErr.message)
  } else if (profile?.is_verified === false) {
    return {
      ok: false,
      error: "Verify your email before signing in.",
      status: 403,
    }
  }

  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  })

  if (linkError || !linkData?.properties?.hashed_token) {
    console.error("[magic-link] generateLink:", linkError?.message)
    return { ok: false, error: "Could not start session.", status: 500 }
  }

  const supabase = await createRouteHandlerSupabaseClient()
  const { data: authData, error: verifyError } = await supabase.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: "email",
  })

  if (verifyError || !authData.session?.user) {
    console.error("[magic-link] verifyOtp:", verifyError?.message)
    return { ok: false, error: "Could not complete sign-in.", status: 500 }
  }

  const consumedAt = new Date().toISOString()
  const { error: consumeErr } = await admin
    .from("auth_magic_link_tokens")
    .update({ consumed_at: consumedAt })
    .eq("id", row.id)
    .is("consumed_at", null)

  if (consumeErr) {
    console.warn("[magic-link] consume update:", consumeErr.message)
  }

  await admin.from("auth_magic_link_tokens").delete().eq("user_id", row.user_id).is("consumed_at", null)

  return { ok: true, userId: authData.session.user.id }
}
