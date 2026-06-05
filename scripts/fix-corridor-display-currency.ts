/**
 * Repair auth metadata for operating-corridor users stuck on USD (or other wrong fiat).
 *
 *   npx tsx scripts/fix-corridor-display-currency.ts
 *   npx tsx scripts/fix-corridor-display-currency.ts --country UG
 *   npx tsx scripts/fix-corridor-display-currency.ts --dry-run
 */

import { config } from "dotenv"
import { resolve } from "path"
import { createAdminClient } from "../lib/supabaseAdmin"

config({ path: resolve(process.cwd(), ".env.local") })
import {
  OPERATING_COUNTRIES,
  corridorCurrencyForCountry,
  isSupportedOperatingCountry,
} from "../lib/operating-countries"

function parseArgs(argv: string[]) {
  let country = ""
  let dryRun = false
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--country" && argv[i + 1]) country = argv[++i].trim().toUpperCase().slice(0, 2)
    else if (argv[i] === "--dry-run") dryRun = true
  }
  return { country, dryRun }
}

const NON_USD_CORRIDORS = OPERATING_COUNTRIES.filter((c) => c.currency !== "USD").map((c) => c.code)

async function main() {
  const { country: countryFilter, dryRun } = parseArgs(process.argv)
  const targetCountries = countryFilter
    ? isSupportedOperatingCountry(countryFilter)
      ? [countryFilter]
      : (() => {
          throw new Error(`Unsupported country filter: ${countryFilter}`)
        })()
    : NON_USD_CORRIDORS

  const admin = createAdminClient()
  const { data: profiles, error } = await admin
    .from("profiles")
    .select("id, funding_country_code")
    .in("funding_country_code", targetCountries)

  if (error) throw new Error(error.message)

  const mismatched: Array<{
    userId: string
    email: string | null
    country: string
    from: string
    to: string
  }> = []

  for (const row of profiles ?? []) {
    const country = (row.funding_country_code ?? "").trim().toUpperCase().slice(0, 2)
    const expected = corridorCurrencyForCountry(country)
    if (!expected || expected === "USD") continue

    const { data: userData, error: userErr } = await admin.auth.admin.getUserById(row.id)
    if (userErr || !userData.user) continue

    const meta = userData.user.user_metadata as Record<string, unknown>
    const current = String(meta.preferred_currency ?? meta.preferredCurrency ?? "USD")
      .trim()
      .toUpperCase()

    if (current === expected) continue

    mismatched.push({
      userId: row.id,
      email: userData.user.email ?? null,
      country,
      from: current || "USD",
      to: expected,
    })
  }

  console.log("fix-corridor-display-currency: scan", {
    targetCountries,
    profilesScanned: profiles?.length ?? 0,
    mismatched: mismatched.length,
    dryRun,
  })

  if (mismatched.length === 0) {
    console.log("fix-corridor-display-currency: nothing to repair")
    return
  }

  for (const hit of mismatched) {
    console.log("repair", hit)
    if (dryRun) continue

    const { error: authErr } = await admin.auth.admin.updateUserById(hit.userId, {
      user_metadata: { preferred_currency: hit.to },
    })
    if (authErr) throw new Error(`${hit.userId}: ${authErr.message}`)
  }

  console.log("fix-corridor-display-currency: OK", {
    repaired: dryRun ? 0 : mismatched.length,
  })
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
