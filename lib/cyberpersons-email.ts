const DEFAULT_SEND_URL = "https://platform.cyberpersons.com/email/v1/send"
const DEFAULT_MESSAGES_URL = "https://platform.cyberpersons.com/email/v1/messages"

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function senderFromEnv(): { email: string; name: string } {
  const email = (process.env.CYBERPERSONS_SENDER_EMAIL ?? "no-reply@nexuspro.it.com").trim()
  const name = (process.env.CYBERPERSONS_SENDER_NAME ?? "Nexus Pro").trim()
  return { email, name }
}

function apiKeyFromEnv(): string {
  const key = process.env.CYBERPERSONS_EMAIL_API_KEY?.trim()
  if (!key) {
    throw new Error("Missing CYBERPERSONS_EMAIL_API_KEY")
  }
  return key
}

function mapApiErrorMessage(detail: string, status: number): string {
  if (/unauthorized|invalid.*key|authentication/i.test(detail)) {
    return (
      "Transactional email (Cyberpersons) rejected the API key. Create a live API key at platform.cyberpersons.com/email " +
      "(API Keys), set CYBERPERSONS_EMAIL_API_KEY on the server with no quotes or trailing spaces, then restart PM2."
    )
  }
  if (/not verified|domain/i.test(detail)) {
    return "Sender domain is not verified in Cyberpersons Email Delivery. Verify the domain before sending."
  }
  return detail || `Cyberpersons email API error (${status})`
}

type SendResponse = {
  success?: boolean
  data?: { message_id?: string; status?: string }
  error?: string
  message?: string
}

async function postTransactionalEmail(payload: {
  to: string
  subject: string
  html: string
  text: string
  fullName: string
}): Promise<string> {
  const apiKey = apiKeyFromEnv()
  const sender = senderFromEnv()
  const sendUrl = (process.env.CYBERPERSONS_EMAIL_API_URL ?? DEFAULT_SEND_URL).trim()

  const res = await fetch(sendUrl, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from: sender.email,
      to: payload.to.trim(),
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
      reply_to: sender.email,
      tags: ["nexus-pro"],
      metadata: { recipient_name: payload.fullName.trim() || "Valued Customer" },
    }),
    signal: AbortSignal.timeout(15_000),
  })

  const body = (await res.json().catch(() => ({}))) as SendResponse
  if (!res.ok || body.success === false) {
    const detail = body.error ?? body.message ?? res.statusText
    throw new Error(mapApiErrorMessage(detail, res.status))
  }

  return body.data?.message_id?.trim() ?? ""
}

/**
 * Transactional signup verification via Cyberpersons Email Delivery REST API.
 * Env: CYBERPERSONS_EMAIL_API_KEY (required), CYBERPERSONS_SENDER_EMAIL, CYBERPERSONS_SENDER_NAME (optional).
 */
export async function sendVerificationEmail(
  to: string,
  code: string,
  fullName: string = "Valued Customer",
): Promise<string> {
  const safeName = escapeHtml(fullName.trim() || "Valued Customer")
  const safeCode = escapeHtml(code)

  return postTransactionalEmail({
    to,
    fullName,
    subject: "Your Nexus Pro verification code",
    html: `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 28px;">Nexus Pro</h1>
    <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0;">Trading Platform</p>
  </div>
  <div style="background: #ffffff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 10px 10px;">
    <h2 style="color: #333; margin-top: 0;">Verify your email address</h2>
    <p>Hello <strong>${safeName}</strong>,</p>
    <p>Thank you for registering with Nexus Pro. Use this code to complete registration:</p>
    <div style="background: #f4f4f4; padding: 20px; text-align: center; font-size: 36px; font-weight: bold; letter-spacing: 8px; border-radius: 8px; margin: 25px 0;">
      ${safeCode}
    </div>
    <p style="color: #666; font-size: 14px;">This code expires in <strong>15 minutes</strong>.</p>
    <p style="color: #666; font-size: 14px;">If you did not request this, ignore this email.</p>
    <hr style="border: none; border-top: 1px solid #eee; margin: 25px 0;">
    <p style="color: #999; font-size: 12px; text-align: center;">Nexus Pro Trading Platform<br>Secure • Fast • Reliable</p>
  </div>
</body></html>`,
    text: `Your Nexus Pro verification code is: ${code}\n\nThis code expires in 15 minutes.\n\nIf you did not request this, ignore this email.`,
  })
}

export async function sendPasswordRecoveryEmail(
  to: string,
  recoveryUrl: string,
  fullName: string = "Valued Customer",
): Promise<string> {
  const safeName = escapeHtml(fullName.trim() || "Valued Customer")
  const safeUrl = escapeHtml(recoveryUrl.trim())

  return postTransactionalEmail({
    to,
    fullName,
    subject: "Reset your Nexus Pro password",
    html: `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #0ea5e9 0%, #2563eb 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 28px;">Nexus Pro</h1>
    <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0;">Password Recovery</p>
  </div>
  <div style="background: #ffffff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 10px 10px;">
    <h2 style="color: #333; margin-top: 0;">Reset your password</h2>
    <p>Hello <strong>${safeName}</strong>,</p>
    <p>Click the button below to reset your password securely:</p>
    <p style="text-align:center; margin: 24px 0;">
      <a href="${safeUrl}" style="display:inline-block; background:#2563eb; color:#fff; text-decoration:none; padding:12px 20px; border-radius:8px; font-weight:600;">
        Reset Password
      </a>
    </p>
    <p style="word-break:break-all; font-size:12px; color:#666;">If button does not work, open this link:<br>${safeUrl}</p>
    <p style="color: #666; font-size: 14px;">If you did not request this, ignore this email.</p>
  </div>
</body></html>`,
    text: `Reset your Nexus Pro password: ${recoveryUrl}\n\nIf you did not request this, ignore this email.`,
  })
}

export async function getTransactionalEmailMessageEvent(
  messageId: string,
): Promise<{ event?: string; reason?: string } | null> {
  const apiKey = process.env.CYBERPERSONS_EMAIL_API_KEY?.trim()
  if (!apiKey || !messageId) return null

  const base = (process.env.CYBERPERSONS_EMAIL_MESSAGES_URL ?? DEFAULT_MESSAGES_URL).replace(/\/$/, "")
  const url = `${base}/${encodeURIComponent(messageId)}`
  const res = await fetch(url, {
    headers: {
      accept: "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) return null

  const body = (await res.json().catch(() => ({}))) as {
    data?: { status?: string; bounce_reason?: string; reason?: string }
    status?: string
  }
  const status = body.data?.status ?? body.status
  if (!status) return null
  return {
    event: status,
    reason: body.data?.bounce_reason ?? body.data?.reason,
  }
}

/** Optional smoke test from a server script or temporary route. */
export async function sendTestEmail(email: string) {
  await sendVerificationEmail(email, "123456", "Test User")
}

/** True when CYBERPERSONS_EMAIL_API_KEY is set (health / deploy audits). */
export function isCyberpersonsEmailConfigured(): boolean {
  return Boolean(process.env.CYBERPERSONS_EMAIL_API_KEY?.trim())
}
