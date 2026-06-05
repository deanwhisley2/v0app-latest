/**
 * Transactional auth email — Brevo SMTP (nodemailer) for all verification, recovery, and codes.
 */
import { isSmtpConfigured, sendSmtpMail } from "@/lib/server/smtp-mail"
import { buildBrandedTransactionalEmail } from "@/lib/server/transactional-email-templates"
import { transactionalSenderFromEnv } from "@/lib/server/transactional-sender"

export function senderFromTransactionalEnv(): { email: string; name: string } {
  const { fromEmail, fromName } = transactionalSenderFromEnv()
  return { email: fromEmail, name: fromName }
}

export async function sendTransactionalVerificationEmail(
  to: string,
  code: string,
  fullName: string = "Valued Customer",
): Promise<{ messageId: string }> {
  const mail = buildBrandedTransactionalEmail({
    subject: "Verify your Nexus Pro email",
    preheader: "Your secure verification code from Nexus Pro.",
    headline: "Verify your email address",
    greetingName: fullName,
    bodyHtml:
      "<p style=\"margin:0 0 12px;\">You requested email verification for your Nexus Pro account. Enter the code below on the verification screen to continue.</p><p style=\"margin:0 0 12px;font-size:14px;color:#64748b;\">Most messages arrive within one minute. Some providers may take a little longer.</p><p style=\"margin:0;font-size:14px;color:#64748b;\">This code expires in <strong>10 minutes</strong>.</p>",
    bodyText:
      "You requested email verification for your Nexus Pro account. Enter the code below on the verification screen to continue.\n\nMost messages arrive within one minute.\n\nThis code expires in 10 minutes.",
    code,
    purpose: "verification",
    securityNote:
      "Never share this code with anyone — including people claiming to be Nexus Pro support. If you did not request this, you can ignore this email.",
  })
  const { messageId } = await sendSmtpMail({ to, ...mail })
  return { messageId }
}

export async function sendTransactionalPasswordRecoveryEmail(
  to: string,
  recoveryUrl: string,
  fullName: string = "Valued Customer",
): Promise<{ messageId: string }> {
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
  const { messageId } = await sendSmtpMail({ to, ...mail })
  return { messageId }
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
