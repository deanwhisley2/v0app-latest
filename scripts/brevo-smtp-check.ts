#!/usr/bin/env npx tsx
/**
 * Verify Brevo SMTP credentials (nodemailer verify — no email sent).
 *
 *   npm run brevo:smtp-check
 *   cd /opt/nexus-pro && npm run brevo:smtp-check
 */
import { config } from "dotenv"
import { resolve } from "node:path"
import { isSmtpConfigured, smtpConfigFromEnv, verifySmtpConnection } from "../lib/server/smtp-mail"

config({ path: resolve(process.cwd(), ".env.local") })
config({ path: resolve(process.cwd(), ".env") })

function describeSecret(raw: string | undefined): string {
  if (!raw?.trim()) return "(empty or missing)"
  const k = raw.trim()
  const head = k.slice(0, 10)
  const tail = k.length > 14 ? k.slice(-4) : ""
  let note = ""
  if (k.toLowerCase().startsWith("xsmtpsib")) {
    note = " (xsmtpsib = Brevo SMTP relay key — correct for SMTP)"
  } else if (k.toLowerCase().startsWith("xkeysib")) {
    note = " (xkeysib = REST API key — use SMTP relay key xsmtpsib for BREVO_SMTP_PASSWORD)"
  }
  return `length=${k.length}, starts_with="${head}…"${tail ? `, ends_with="…${tail}"` : ""}${note}`
}

async function main() {
  const cfg = smtpConfigFromEnv()
  console.log("Brevo SMTP check")
  console.log("configured:", isSmtpConfigured())
  if (cfg) {
    console.log("host:", cfg.host)
    console.log("port:", cfg.port)
    console.log("user:", cfg.user)
    console.log("password:", describeSecret(process.env.BREVO_SMTP_PASSWORD ?? process.env.SMTP_PASSWORD))
    console.log("from:", `${cfg.fromName} <${cfg.fromEmail}>`)
  }

  if (!isSmtpConfigured()) {
    console.error(
      "\nFAIL: Set BREVO_SMTP_USER and BREVO_SMTP_PASSWORD (Brevo → SMTP & API → SMTP keys, xsmtpsib…).",
    )
    process.exit(1)
  }

  try {
    await verifySmtpConnection()
    console.log("\nPASS: SMTP relay accepted credentials (verify OK).")
  } catch (e) {
    console.error("\nFAIL:", e instanceof Error ? e.message : String(e))
    process.exit(1)
  }
}

main()
