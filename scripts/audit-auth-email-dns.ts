#!/usr/bin/env npx tsx
/**
 * Audit auth email DNS (SPF/DKIM/DMARC), sender alignment, and optional live delivery.
 *
 * Usage:
 *   npx tsx scripts/audit-auth-email-dns.ts
 *   npx tsx scripts/audit-auth-email-dns.ts --send-test user@gmail.com user@outlook.com user@yahoo.com
 *
 * Loads .env.local for Brevo SMTP when --send-test is used.
 */
import { config } from "dotenv"
import { resolve } from "node:path"
import { execSync } from "node:child_process"

config({ path: resolve(process.cwd(), ".env.local") })
config({ path: resolve(process.cwd(), ".env") })

const DOMAIN = (
  process.env.BREVO_SENDER_EMAIL ??
  process.env.SMTP_FROM_EMAIL ??
  "no-reply@nexuspro.it.com"
)
  .split("@")[1]
  ?.trim()
  .toLowerCase() ?? "nexuspro.it.com"

const DKIM_SELECTORS = ["brevo1", "brevo2", "brevo", "mail", "default", "dkim", "k1", "k2"]

type DnsRow = { label: string; value: string | null; ok?: boolean }

function digTxt(name: string): string[] {
  try {
    const out = execSync(`dig +short TXT ${name}`, { encoding: "utf8", timeout: 10_000 }).trim()
    if (!out) return []
    return out
      .split("\n")
      .map((line) => line.replace(/^"|"$/g, "").replace(/"\s+"/g, ""))
      .filter(Boolean)
  } catch {
    return []
  }
}

function auditDns(providerInfo: { provider: string; configured: boolean }): {
  rows: DnsRow[]
  blockers: string[]
} {
  const blockers: string[] = []
  const rows: DnsRow[] = []

  const apexTxt = digTxt(DOMAIN)
  const spf = apexTxt.find((t) => /v=spf1/i.test(t)) ?? null
  rows.push({
    label: `SPF (${DOMAIN})`,
    value: spf,
    ok: Boolean(spf && /v=spf1/i.test(spf)),
  })
  if (!spf) blockers.push("Missing SPF TXT on apex domain")

  const dmarcRecords = digTxt(`_dmarc.${DOMAIN}`)
  const dmarc = dmarcRecords[0] ?? null
  rows.push({
    label: `DMARC (_dmarc.${DOMAIN})`,
    value: dmarc,
    ok: Boolean(dmarc && /v=DMARC1/i.test(dmarc)),
  })
  if (!dmarc) blockers.push("Missing DMARC record")

  const dkimHits: string[] = []
  for (const sel of DKIM_SELECTORS) {
    const recs = digTxt(`${sel}._domainkey.${DOMAIN}`)
    if (recs.length) dkimHits.push(`${sel}: ${recs.join(" | ")}`)
  }
  rows.push({
    label: `DKIM (${DOMAIN})`,
    value: dkimHits.length ? dkimHits.join("\n") : null,
    ok: dkimHits.length > 0,
  })
  if (!dkimHits.length) {
    blockers.push(
      "No DKIM TXT records found — Gmail/Outlook/Yahoo commonly hard-bounce or spam-folder unsigned mail",
    )
  }

  const spfInclude = digTxt("spf.brevo.com").find((t) => /v=spf1/i.test(t)) ?? null
  rows.push({
    label: "SPF include (spf.brevo.com)",
    value: spfInclude,
    ok: Boolean(spfInclude),
  })

  const senderEmail = (
    process.env.BREVO_SENDER_EMAIL ??
    process.env.SMTP_FROM_EMAIL ??
    "no-reply@nexuspro.it.com"
  ).trim()
  const senderName = (process.env.BREVO_SENDER_NAME ?? process.env.SMTP_FROM_NAME ?? "Nexus Pro").trim()
  const fromDomain = senderEmail.split("@")[1]?.toLowerCase() ?? ""
  rows.push({
    label: "Sender From address",
    value: `${senderName} <${senderEmail}>`,
    ok: fromDomain === DOMAIN,
  })
  if (fromDomain !== DOMAIN) {
    blockers.push(`From domain (${fromDomain}) does not match audited domain (${DOMAIN}) — alignment broken`)
  }

  const spfAligned =
    Boolean(spf) &&
    (/include:spf\.brevo\.com/i.test(spf!) ||
      /include:sendinblue\.com/i.test(spf!) ||
      /include:.*brevo/i.test(spf!))
  rows.push({
    label: "SPF ↔ Brevo alignment",
    value: spfAligned ? "SPF authorizes Brevo relay" : "SPF may not authorize actual sending path",
    ok: spfAligned,
  })
  if (!spfAligned) blockers.push("SPF does not include spf.brevo.com (or sendinblue.com)")

  rows.push({
    label: "DMARC policy",
    value: dmarc?.match(/;\s*p=([^;]+)/i)?.[1]?.trim() ?? "unknown",
    ok: true,
  })

  rows.push({
    label: "Transactional provider (runtime)",
    value: providerInfo.provider,
    ok: providerInfo.configured,
  })
  if (!providerInfo.configured) {
    blockers.push("Brevo SMTP is not configured (missing BREVO_SMTP_USER / BREVO_SMTP_PASSWORD)")
  }

  return { rows, blockers }
}

async function sendTests(addresses: string[]): Promise<void> {
  const { sendTransactionalVerificationEmail, isTransactionalEmailConfigured } = await import(
    "../lib/server/transactional-email"
  )

  if (!isTransactionalEmailConfigured()) {
    console.error("\n--send-test skipped: Brevo SMTP not configured")
    return
  }

  console.log("\n=== Live delivery probes (Brevo SMTP) ===")
  for (const to of addresses) {
    const label = to.trim().toLowerCase()
    if (!label.includes("@")) continue
    console.log(`\n→ ${label}`)
    try {
      await sendTransactionalVerificationEmail(label, "000000", "Delivery audit")
      console.log("  accepted via SMTP (check inbox / Brevo transactional logs)")
    } catch (e) {
      console.log(`  send failed: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
}

function printRows(rows: DnsRow[]) {
  for (const row of rows) {
    const status = row.ok === false ? "FAIL" : row.ok === true ? "PASS" : "INFO"
    console.log(`[${status}] ${row.label}`)
    if (row.value) console.log(`       ${row.value.replace(/\n/g, "\n       ")}`)
    else console.log("       (not found)")
  }
}

async function main() {
  const sendIdx = process.argv.indexOf("--send-test")
  const testRecipients =
    sendIdx >= 0 ? process.argv.slice(sendIdx + 1).filter((a) => !a.startsWith("-")) : []

  console.log(`Auth email DNS audit — domain: ${DOMAIN}`)
  console.log(`Date: ${new Date().toISOString()}`)

  const { getTransactionalEmailProvider, isTransactionalEmailConfigured } = await import(
    "../lib/server/transactional-email"
  )
  const { rows, blockers } = auditDns({
    provider: getTransactionalEmailProvider(),
    configured: isTransactionalEmailConfigured(),
  })
  console.log("\n=== DNS & alignment ===")
  printRows(rows)

  if (blockers.length) {
    console.log("\n=== Blockers ===")
    for (const b of blockers) console.log(`- ${b}`)
  } else {
    console.log("\n=== Blockers ===\n(none detected from DNS alone)")
  }

  console.log("\n=== Brevo note ===")
  console.log("Auth codes use Brevo SMTP relay (smtp-relay.brevo.com:587), not local VPS Postfix.")
  console.log("Bounce reasons: Brevo dashboard → Transactional → Logs, or SMTP rejection in PM2 logs.")

  if (testRecipients.length) {
    await sendTests(testRecipients)
  } else {
    console.log(
      "\nOptional: npx tsx scripts/audit-auth-email-dns.ts --send-test you@gmail.com you@outlook.com you@yahoo.com",
    )
  }

  process.exit(blockers.length ? 1 : 0)
}

void main()
