#!/usr/bin/env npx tsx
/**
 * Verify Brevo/VPS transactional sender env matches institutional defaults.
 * Usage: npx tsx scripts/verify-transactional-sender-env.ts
 */
import { config } from "dotenv"
import { resolve } from "node:path"
import {
  NEXUS_SECURITY_EMAIL,
  NEXUS_SUPPORT_EMAIL,
  transactionalSenderFromEnv,
} from "../lib/server/transactional-sender"

config({ path: resolve(process.cwd(), ".env.local") })
config({ path: resolve(process.cwd(), ".env") })

const sender = transactionalSenderFromEnv()
const checks = [
  {
    label: "Brevo / SMTP From",
    expected: `${NEXUS_SECURITY_EMAIL} (Nexus pro)`,
    actual: `${sender.fromEmail} (${sender.fromName})`,
    ok: sender.fromEmail.toLowerCase() === NEXUS_SECURITY_EMAIL,
  },
  {
    label: "Reply-To",
    expected: NEXUS_SUPPORT_EMAIL,
    actual: sender.replyToEmail,
    ok: sender.replyToEmail.toLowerCase() === NEXUS_SUPPORT_EMAIL,
  },
]

let pass = true
for (const c of checks) {
  const status = c.ok ? "PASS" : "FAIL"
  if (!c.ok) pass = false
  console.log(`${status} ${c.label}`)
  console.log(`  expected: ${c.expected}`)
  console.log(`  actual:   ${c.actual}`)
}

console.log("\nNote: App auth mail uses Brevo SMTP; Supabase custom SMTP should match the same sender.")
console.log(
  "Supabase Dashboard → Authentication → SMTP: security@nexuspro.it.com (Nexus pro), smtp-relay.brevo.com:587.",
)
console.log("Brevo Dashboard → Senders: verify security@nexuspro.it.com is authenticated.")

process.exit(pass ? 0 : 1)
