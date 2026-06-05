/**
 * Transactional auth email — Brevo SMTP (nodemailer) for all verification, recovery, and codes.
 *
 * Env: BREVO_SMTP_USER, BREVO_SMTP_PASSWORD, optional BREVO_SMTP_HOST (default smtp-relay.brevo.com),
 * BREVO_SENDER_EMAIL, BREVO_SENDER_NAME. Generic SMTP_* aliases supported.
 */
import { isSmtpConfigured, sendSmtpMail } from "@/lib/server/smtp-mail"

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

export function senderFromTransactionalEnv(): { email: string; name: string } {
  const email = (
    process.env.BREVO_SENDER_EMAIL ??
    process.env.SMTP_FROM_EMAIL ??
    process.env.TRANSACTIONAL_FROM_EMAIL ??
    "no-reply@nexuspro.it.com"
  ).trim()
  const name = (
    process.env.BREVO_SENDER_NAME ??
    process.env.SMTP_FROM_NAME ??
    process.env.TRANSACTIONAL_FROM_NAME ??
    "Nexus Pro"
  ).trim()
  return { email, name }
}

async function sendVerificationViaSmtp(to: string, code: string, fullName: string): Promise<string> {
  const safeName = escapeHtml(fullName.trim() || "Valued Customer")
  const safeCode = escapeHtml(code)

  await sendSmtpMail({
    to,
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
    purpose: "verification",
  })
  return ""
}

async function sendRecoveryViaSmtp(to: string, recoveryUrl: string, fullName: string): Promise<string> {
  const safeName = escapeHtml(fullName.trim() || "Valued Customer")
  const safeUrl = escapeHtml(recoveryUrl.trim())

  await sendSmtpMail({
    to,
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
    purpose: "password_recovery",
  })
  return ""
}

export async function sendTransactionalVerificationEmail(
  to: string,
  code: string,
  fullName: string = "Valued Customer",
): Promise<string> {
  return sendVerificationViaSmtp(to, code, fullName)
}

export async function sendTransactionalPasswordRecoveryEmail(
  to: string,
  recoveryUrl: string,
  fullName: string = "Valued Customer",
): Promise<string> {
  return sendRecoveryViaSmtp(to, recoveryUrl, fullName)
}

export async function getTransactionalDeliveryEvent(
  _messageId: string,
): Promise<{ event?: string; reason?: string } | null> {
  return null
}

export function isTransactionalEmailConfigured(): boolean {
  return isSmtpConfigured()
}

/** @deprecated Use isTransactionalEmailConfigured — kept for audit script compatibility. */
export function getTransactionalEmailProvider(): "brevo_smtp" {
  return "brevo_smtp"
}
