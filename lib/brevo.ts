const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email"

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

/**
 * Transactional signup verification via Brevo HTTP API (no axios — uses fetch).
 * Env: BREVO_API_KEY (required), BREVO_SENDER_EMAIL, BREVO_SENDER_NAME (optional).
 */
export async function sendVerificationEmail(
  to: string,
  code: string,
  fullName: string = "Valued Customer"
) {
  const apiKey = process.env.BREVO_API_KEY
  if (!apiKey) {
    throw new Error("Missing BREVO_API_KEY")
  }

  const senderEmail =
    process.env.BREVO_SENDER_EMAIL ?? "noreply@nexuspro.it.com"
  const senderName = process.env.BREVO_SENDER_NAME ?? "Nexus Pro"
  const safeName = escapeHtml(fullName.trim() || "Valued Customer")
  const safeCode = escapeHtml(code)

  const res = await fetch(BREVO_API_URL, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "api-key": apiKey,
    },
    body: JSON.stringify({
      sender: { name: senderName, email: senderEmail },
      to: [{ email: to.trim(), name: fullName.trim() || "Valued Customer" }],
      subject: "Your Nexus Pro verification code",
      htmlContent: `<!DOCTYPE html>
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
      textContent: `Your Nexus Pro verification code is: ${code}\n\nThis code expires in 15 minutes.\n\nIf you did not request this, ignore this email.`,
    }),
    signal: AbortSignal.timeout(15_000),
  })

  if (!res.ok) {
    let detail = res.statusText
    try {
      const errBody = (await res.json()) as { message?: string }
      if (errBody?.message) detail = errBody.message
    } catch {
      /* ignore */
    }
    throw new Error(detail || `Brevo API error (${res.status})`)
  }
}

export async function sendPasswordRecoveryEmail(
  to: string,
  recoveryUrl: string,
  fullName: string = "Valued Customer"
) {
  const apiKey = process.env.BREVO_API_KEY
  if (!apiKey) {
    throw new Error("Missing BREVO_API_KEY")
  }

  const senderEmail =
    process.env.BREVO_SENDER_EMAIL ?? "noreply@nexuspro.it.com"
  const senderName = process.env.BREVO_SENDER_NAME ?? "Nexus Pro"
  const safeName = escapeHtml(fullName.trim() || "Valued Customer")
  const safeUrl = escapeHtml(recoveryUrl.trim())

  const res = await fetch(BREVO_API_URL, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "api-key": apiKey,
    },
    body: JSON.stringify({
      sender: { name: senderName, email: senderEmail },
      to: [{ email: to.trim(), name: fullName.trim() || "Valued Customer" }],
      subject: "Reset your Nexus Pro password",
      htmlContent: `<!DOCTYPE html>
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
      textContent: `Reset your Nexus Pro password: ${recoveryUrl}\n\nIf you did not request this, ignore this email.`,
    }),
    signal: AbortSignal.timeout(15_000),
  })

  if (!res.ok) {
    let detail = res.statusText
    try {
      const errBody = (await res.json()) as { message?: string }
      if (errBody?.message) detail = errBody.message
    } catch {
      /* ignore */
    }
    throw new Error(detail || `Brevo API error (${res.status})`)
  }
}

/** Optional smoke test from a server script or temporary route. */
export async function sendTestEmail(email: string) {
  await sendVerificationEmail(email, "123456", "Test User")
}
