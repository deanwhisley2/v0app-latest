import { createHash, randomBytes } from "crypto"
import nodemailer, { type Transporter } from "nodemailer"

let cachedTransport: Transporter | null = null

export type SmtpConfig = {
  host: string
  port: number
  user: string
  password: string
  fromEmail: string
  fromName: string
}

export function smtpConfigFromEnv(): SmtpConfig | null {
  const host =
    process.env.BREVO_SMTP_HOST?.trim() ||
    process.env.SMTP_HOST?.trim() ||
    "smtp-relay.brevo.com"
  const portRaw =
    process.env.BREVO_SMTP_PORT?.trim() || process.env.SMTP_PORT?.trim() || "587"
  const user = process.env.BREVO_SMTP_USER?.trim() || process.env.SMTP_USER?.trim()
  const password =
    process.env.BREVO_SMTP_PASSWORD?.trim() || process.env.SMTP_PASSWORD?.trim()
  const fromEmail =
    process.env.BREVO_SENDER_EMAIL?.trim() ||
    process.env.SMTP_FROM_EMAIL?.trim() ||
    process.env.TRANSACTIONAL_FROM_EMAIL?.trim() ||
    "no-reply@nexuspro.it.com"
  const fromName =
    process.env.BREVO_SENDER_NAME?.trim() ||
    process.env.SMTP_FROM_NAME?.trim() ||
    process.env.TRANSACTIONAL_FROM_NAME?.trim() ||
    "Nexus Pro"

  if (!user || !password) return null

  return {
    host,
    port: Number.parseInt(portRaw, 10) || 587,
    user,
    password,
    fromEmail,
    fromName,
  }
}

export function isSmtpConfigured(): boolean {
  return smtpConfigFromEnv() !== null
}

function getTransport(): Transporter {
  if (cachedTransport) return cachedTransport
  const cfg = smtpConfigFromEnv()
  if (!cfg) {
    throw new Error(
      "Brevo SMTP is not configured. Set BREVO_SMTP_USER, BREVO_SMTP_PASSWORD (and optional BREVO_SMTP_HOST, BREVO_SENDER_*).",
    )
  }
  cachedTransport = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.port === 465,
    auth: { user: cfg.user, pass: cfg.password },
    requireTLS: cfg.port === 587,
  })
  return cachedTransport
}

export async function verifySmtpConnection(): Promise<void> {
  const transport = getTransport()
  await transport.verify()
}

export async function sendSmtpMail(params: {
  to: string
  subject: string
  html: string
  text: string
  /** Used for Message-ID / logging — e.g. login_code, verification */
  purpose?: string
}): Promise<void> {
  const cfg = smtpConfigFromEnv()
  if (!cfg) throw new Error("Brevo SMTP is not configured")

  const transport = getTransport()
  const domain = cfg.fromEmail.split("@")[1] ?? "nexuspro.it.com"
  const messageId = `<${createHash("sha256").update(randomBytes(16)).digest("hex").slice(0, 24)}@${domain}>`

  await transport.sendMail({
    from: `"${cfg.fromName}" <${cfg.fromEmail}>`,
    sender: `"${cfg.fromName}" <${cfg.fromEmail}>`,
    to: params.to.trim(),
    subject: params.subject,
    text: params.text,
    html: params.html,
    replyTo: cfg.fromEmail,
    headers: {
      "Message-ID": messageId,
      "X-Mailer": "Nexus Pro Transactional",
      "Auto-Submitted": "auto-generated",
      "X-Auto-Response-Suppress": "All",
      ...(params.purpose ? { "X-Entity-Ref-ID": params.purpose } : {}),
    },
  })
}
