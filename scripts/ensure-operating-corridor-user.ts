/**
 * Align one account to a supported operating corridor (profile + auth metadata + users.region).
 *
 *   npx tsx scripts/ensure-operating-corridor-user.ts --email malobacharles@gmail.com --country KE
 */

import { createAdminClient } from "../lib/supabaseAdmin"
import { corridorCurrencyForCountry, operatingCountryByCode, isSupportedOperatingCountry } from "../lib/operating-countries"
import type { AppLanguage } from "../lib/user-preferences"

function parseArgs(argv: string[]) {
  let email = ""
  let country = "KE"
  let language: AppLanguage | undefined
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--email" && argv[i + 1]) email = argv[++i].trim().toLowerCase()
    else if (argv[i] === "--country" && argv[i + 1]) country = argv[++i].trim().toUpperCase()
    else if (argv[i] === "--language" && argv[i + 1]) language = argv[++i].trim().toLowerCase() as AppLanguage
  }
  return { email, country, language }
}

async function findUserIdByEmail(admin: ReturnType<typeof createAdminClient>, email: string): Promise<string | null> {
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 })
  if (error) throw new Error(error.message)
  const hit = data.users.find((u) => (u.email ?? "").trim().toLowerCase() === email)
  return hit?.id ?? null
}

async function main() {
  const { email, country, language: langOverride } = parseArgs(process.argv)
  if (!email) {
    console.error("Usage: npx tsx scripts/ensure-operating-corridor-user.ts --email <email> [--country KE] [--language en]")
    process.exit(1)
  }
  const code = country.trim().toUpperCase().slice(0, 2)
  if (!isSupportedOperatingCountry(code)) {
    throw new Error(`Unsupported country: ${code}`)
  }
  const row = operatingCountryByCode(code)
  if (!row) throw new Error(`Missing operating country row: ${code}`)

  const language: AppLanguage = code === "KE" ? "en" : langOverride ?? row.language
  const currency = corridorCurrencyForCountry(code) ?? row.currency
  const now = new Date().toISOString()

  const admin = createAdminClient()
  const userId = await findUserIdByEmail(admin, email)
  if (!userId) throw new Error(`No auth user for ${email}`)

  const { error: profErr } = await admin
    .from("profiles")
    .update({ funding_country_code: code, updated_at: now })
    .eq("id", userId)
  if (profErr) throw new Error(profErr.message)

  const { error: usersErr } = await admin.from("users").update({ region: code, updated_at: now }).eq("id", userId)
  if (usersErr) throw new Error(usersErr.message)

  const { error: authErr } = await admin.auth.admin.updateUserById(userId, {
    user_metadata: {
      preferred_language: language,
      preferred_currency: currency,
      funding_country_code: code,
    },
  })
  if (authErr) throw new Error(authErr.message)

  console.log("ensure-operating-corridor-user: OK", {
    email,
    userId,
    funding_country_code: code,
    preferred_language: language,
    preferred_currency: currency,
    region: code,
  })
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
