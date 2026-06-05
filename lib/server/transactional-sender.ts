/** Canonical transactional sender identity for auth / security email. */

export const NEXUS_SUPPORT_EMAIL = "support@nexuspro.it.com"
export const NEXUS_SECURITY_EMAIL = "security@nexuspro.it.com"

export type TransactionalSenderIdentity = {
  fromEmail: string
  fromName: string
  replyToEmail: string
}

/** Prefer security@ for inbox placement; env overrides for staged rollouts. */
export function transactionalSenderFromEnv(): TransactionalSenderIdentity {
  const fromEmail = (
    process.env.BREVO_SENDER_EMAIL ??
    process.env.SMTP_FROM_EMAIL ??
    process.env.TRANSACTIONAL_FROM_EMAIL ??
    NEXUS_SECURITY_EMAIL
  ).trim()

  const fromName = (
    process.env.BREVO_SENDER_NAME ??
    process.env.SMTP_FROM_NAME ??
    process.env.TRANSACTIONAL_FROM_NAME ??
    "Nexus Pro Security"
  ).trim()

  const replyToEmail = (
    process.env.TRANSACTIONAL_REPLY_TO_EMAIL ??
    process.env.BREVO_REPLY_TO_EMAIL ??
    NEXUS_SUPPORT_EMAIL
  ).trim()

  return { fromEmail, fromName, replyToEmail }
}

export function transactionalListUnsubscribeHeader(replyToEmail: string): string {
  const subject = encodeURIComponent("Unsubscribe from Nexus Pro transactional email")
  return `<mailto:${replyToEmail}?subject=${subject}>`
}
