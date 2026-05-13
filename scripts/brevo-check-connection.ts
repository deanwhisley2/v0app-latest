#!/usr/bin/env npx tsx
/**
 * Verify BREVO_API_KEY against Brevo (GET /v3/account — no email sent).
 *
 * Usage (repo root, with secrets in .env.local or env):
 *   npm run brevo:check
 *
 * On VPS after deploy:
 *   cd /opt/nexus-pro && npm run brevo:check
 */
import { config } from "dotenv"
import { resolve } from "node:path"

config({ path: resolve(process.cwd(), ".env.local") })
config({ path: resolve(process.cwd(), ".env") })

const ACCOUNT_URL = "https://api.brevo.com/v3/account"

function describeKey(raw: string | undefined): string {
  if (!raw?.trim()) return "(empty or missing)"
  const k = raw.trim()
  const len = k.length
  const head = k.slice(0, 8)
  const tail = len > 12 ? k.slice(-4) : ""
  let note = ""
  if (k.toLowerCase().startsWith("xsmtpsib")) {
    note = " (prefix xsmtpsib = SMTP relay key — use REST API v3 key, usually xkeysib, from Brevo API keys tab.)"
  }
  return `length=${len}, starts_with="${head}…"${tail ? `, ends_with="…${tail}"` : ""}${note}`
}

async function main() {
  const apiKey = process.env.BREVO_API_KEY?.trim()
  console.log("BREVO_API_KEY:", describeKey(process.env.BREVO_API_KEY))
  const sender = (process.env.BREVO_SENDER_EMAIL ?? "noreply@nexuspro.it.com").trim()
  console.log("BREVO_SENDER_EMAIL:", sender || "(default)")

  if (!apiKey) {
    console.error("\nFAIL: BREVO_API_KEY is not set (after trim). Add it to .env.local or export it.")
    process.exit(1)
  }

  const res = await fetch(ACCOUNT_URL, {
    method: "GET",
    headers: {
      accept: "application/json",
      "api-key": apiKey,
    },
    signal: AbortSignal.timeout(15_000),
  })

  const text = await res.text()
  let json: Record<string, unknown> = {}
  try {
    json = JSON.parse(text) as Record<string, unknown>
  } catch {
    /* non-JSON body */
  }

  if (!res.ok) {
    const msg =
      (typeof json.message === "string" && json.message) ||
      (typeof json.error === "string" && json.error) ||
      text.slice(0, 200) ||
      res.statusText
    console.error(`\nFAIL: Brevo returned HTTP ${res.status}`)
    console.error("Detail:", msg)
    if (/key\s*not\s*found/i.test(String(msg))) {
      console.error(
        "\nHint: Brevo rejected the API key. Use a v3 key from Brevo → SMTP & API → API keys (not the SMTP password)."
      )
    }
    process.exit(1)
  }

  const email = json.email
  const company = json.companyName
  const plan = json.plan
  console.log("\nOK: API key is accepted by Brevo (GET /v3/account).")
  if (typeof email === "string") console.log("Account email:", email)
  if (typeof company === "string" && company) console.log("Company:", company)
  if (plan && typeof plan === "object") console.log("Plan:", JSON.stringify(plan))
  process.exit(0)
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e))
  process.exit(1)
})
