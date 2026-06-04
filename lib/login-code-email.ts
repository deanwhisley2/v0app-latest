import { sendSmtpMail } from "@/lib/server/smtp-mail"

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

type CodeEmailKind = "login" | "password_reset"

function transactionalCodeBodies(code: string, fullName: string, kind: CodeEmailKind) {
  const safeName = escapeHtml(fullName.trim() || "Valued Customer")
  const safeCode = escapeHtml(code)
  const copy =
    kind === "password_reset"
      ? {
          subject: "Your Nexus Pro password reset code",
          action: "Enter this code on the password reset page to choose a new password.",
          tag: "password-reset",
        }
      : {
          subject: "Your Nexus Pro sign-in code",
          action: "Enter this code on the login page to sign in.",
          tag: "login-code",
        }

  const text = [
    `Hello ${fullName.trim() || "Valued Customer"},`,
    "",
    `Your verification code is: ${code}`,
    "",
    copy.action,
    "",
    "This code expires in 15 minutes. Do not share it with anyone.",
    "",
    "If you did not request this, ignore this email.",
    "",
    "— Nexus Pro",
    "www.nexuspro.it.com",
  ].join("\n")

  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${copy.subject}</title></head>
<body style="margin:0;padding:20px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;color:#222;background:#f5f5f5;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e5e5e5;border-radius:8px;">
    <tr><td style="padding:24px 24px 8px;">
      <p style="margin:0;font-size:18px;font-weight:bold;color:#111;">Nexus Pro</p>
    </td></tr>
    <tr><td style="padding:8px 24px;">
      <p style="margin:0 0 12px;">Hello <strong>${safeName}</strong>,</p>
      <p style="margin:0 0 16px;">${escapeHtml(copy.action)}</p>
      <p style="margin:0 0 20px;padding:16px;background:#f4f4f4;border-radius:8px;text-align:center;font-size:32px;font-weight:bold;letter-spacing:6px;color:#111;">${safeCode}</p>
      <p style="margin:0;font-size:14px;color:#555;">Expires in 15 minutes. Nexus Pro will never ask you to forward this code.</p>
      <p style="margin:16px 0 0;font-size:14px;color:#555;">If you did not request it, ignore this message.</p>
    </td></tr>
    <tr><td style="padding:16px 24px 24px;border-top:1px solid #eee;font-size:12px;color:#888;">
      Nexus Pro · www.nexuspro.it.com
    </td></tr>
  </table>
</body></html>`

  return { subject: copy.subject, text, html, tag: copy.tag }
}

async function sendViaCyberpersonsRest(
  to: string,
  code: string,
  fullName: string,
  kind: CodeEmailKind,
): Promise<boolean> {
  const apiKey = process.env.CYBERPERSONS_EMAIL_API_KEY?.trim()
  if (!apiKey) return false

  const senderEmail =
    process.env.CYBERPERSONS_SENDER_EMAIL?.trim() ||
    process.env.SMTP_FROM_EMAIL?.trim() ||
    "noreply@nexuspro.it.com"
  const senderName =
    process.env.CYBERPERSONS_SENDER_NAME?.trim() ||
    process.env.SMTP_FROM_NAME?.trim() ||
    "Nexus Pro"
  const sendUrl =
    (process.env.CYBERPERSONS_EMAIL_API_URL ?? "https://platform.cyberpersons.com/email/v1/send").trim()

  const { subject, text, html, tag } = transactionalCodeBodies(code, fullName, kind)

  const res = await fetch(sendUrl, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from: senderEmail,
      to: to.trim(),
      subject,
      html,
      text,
      reply_to: senderEmail,
      tags: ["nexus-pro", tag],
      metadata: { purpose: tag, recipient_name: fullName.trim() || "Customer" },
    }),
    signal: AbortSignal.timeout(15_000),
  })

  const body = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string }
  if (!res.ok || body.success === false) {
    console.warn("[login-code-email] Cyberpersons REST failed:", body.error ?? res.statusText)
    return false
  }
  return true
}

/** Transactional login code — Cyberpersons REST when configured, else SMTP. No links in body. */
async function sendTransactionalCodeEmail(
  to: string,
  code: string,
  fullName: string,
  kind: CodeEmailKind,
): Promise<void> {
  const { subject, text, html, tag } = transactionalCodeBodies(code, fullName, kind)

  if (await sendViaCyberpersonsRest(to, code, fullName, kind)) return

  await sendSmtpMail({
    to,
    subject,
    html,
    text,
    purpose: tag,
  })
}

export async function sendLoginCodeEmail(
  to: string,
  code: string,
  fullName: string = "Valued Customer",
): Promise<void> {
  await sendTransactionalCodeEmail(to, code, fullName, "login")
}

export async function sendPasswordResetCodeEmail(
  to: string,
  code: string,
  fullName: string = "Valued Customer",
): Promise<void> {
  await sendTransactionalCodeEmail(to, code, fullName, "password_reset")
}
