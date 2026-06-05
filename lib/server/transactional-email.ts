/**
 * Transactional auth email — Brevo SMTP (nodemailer) for all verification, recovery, and codes.
 */
import { isSmtpConfigured, sendSmtpMail } from "@/lib/server/smtp-mail"
import { buildBrandedTransactionalEmail } from "@/lib/server/transactional-email-templates"

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

export async function sendTransactionalVerificationEmail(
  to: string,
  code: string,
  fullName: string = "Valued Customer",
): Promise<string> {
  const mail = buildBrandedTransactionalEmail({
    subject: "Your Nexus Pro verification code",
    preheader: "Complete your Nexus Pro registration with this secure code.",
    headline: "Verify your email address",
    greetingName: fullName,
    bodyHtml:
      "<p style=\"margin:0 0 12px;\">Thank you for joining Nexus Pro. Enter the code below to verify your email and continue.</p><p style=\"margin:0;font-size:14px;color:#64748b;\">This code expires in <strong>15 minutes</strong>.</p>",
    bodyText:
      "Thank you for joining Nexus Pro. Enter the code below to verify your email and continue.\n\nThis code expires in 15 minutes.",
    code,
    purpose: "verification",
  })
  await sendSmtpMail({ to, ...mail })
  return ""
}

export async function sendTransactionalPasswordRecoveryEmail(
  to: string,
  recoveryUrl: string,
  fullName: string = "Valued Customer",
): Promise<string> {
  const mail = buildBrandedTransactionalEmail({
    subject: "Reset your Nexus Pro password",
    preheader: "Use this secure link to reset your Nexus Pro password.",
    headline: "Reset your password",
    greetingName: fullName,
    bodyHtml:
      "<p style=\"margin:0 0 12px;\">We received a request to reset your Nexus Pro password. Use the button below to choose a new password.</p>",
    bodyText: "We received a request to reset your Nexus Pro password. Open the link below to choose a new password.",
    cta: { label: "Reset Password", href: recoveryUrl },
    purpose: "password_recovery",
  })
  await sendSmtpMail({ to, ...mail })
  return ""
}

export async function getTransactionalDeliveryEvent(
  _messageId: string,
): Promise<{ event?: string; reason?: string } | null> {
  return null
}

export function isTransactionalEmailConfigured(): boolean {
  return isSmtpConfigured()
}

export function getTransactionalEmailProvider(): "brevo_smtp" {
  return "brevo_smtp"
}
