#!/usr/bin/env npx tsx
/**
 * Create or verify test auth users (email_confirm + profiles.is_verified + trading_user_level).
 * Usage:
 *   npx tsx scripts/provision-verified-test-users.ts email@example.com
 *   npx tsx scripts/provision-verified-test-users.ts email@example.com:2:CD:fr
 * Optional: TEST_USER_PASSWORD=... in env (default NexusTest!Richard2026)
 *   email:level:ISO2[:language] — country + optional language override (e.g. KE:en)
 */
import { config } from "dotenv"
import { resolve } from "node:path"
import { createAdminClient } from "../lib/supabaseAdmin"
import { findAuthUserIdByEmail } from "../lib/auth-users"
import { referralCodeForUserId } from "../lib/referral-code"
import {
  corridorCurrencyForCountry,
  isSupportedOperatingCountry,
  operatingCountryByCode,
} from "../lib/operating-countries"
import type { AppLanguage } from "../lib/user-preferences"

config({ path: resolve(process.cwd(), ".env.local") })
config({ path: resolve(process.cwd(), ".env") })

type TradingLevel = 1 | 2 | 5

type ProvisionSpec = {
  email: string
  level: TradingLevel
  country?: string
  language?: AppLanguage
}

function parseArg(raw: string): ProvisionSpec {
  const parts = raw.trim().split(":")
  const email = (parts[0] ?? "").trim().toLowerCase()
  const level = Number(parts[1])
  const country = parts[2]?.trim().toUpperCase().slice(0, 2)
  const language = parts[3]?.trim().toLowerCase() as AppLanguage | undefined
  return {
    email,
    level: [1, 2, 5].includes(level) ? (level as TradingLevel) : 1,
    ...(country && country.length === 2 ? { country } : {}),
    ...(language ? { language } : {}),
  }
}

async function applyOperatingCountry(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  countryCode: string,
  languageOverride?: AppLanguage,
) {
  const code = countryCode.trim().toUpperCase().slice(0, 2)
  if (!isSupportedOperatingCountry(code)) {
    throw new Error(`Unsupported country code: ${code}`)
  }
  const row = operatingCountryByCode(code)
  if (!row) throw new Error(`Missing operating country: ${code}`)
  const language = languageOverride ?? row.language
  const currency = corridorCurrencyForCountry(code) ?? row.currency
  const now = new Date().toISOString()

  const { error: profErr } = await admin
    .from("profiles")
    .update({ funding_country_code: code, updated_at: now })
    .eq("id", userId)
  if (profErr) throw new Error(`profiles funding_country_code: ${profErr.message}`)

  const { error: usersErr } = await admin
    .from("users")
    .update({ region: code, updated_at: now })
    .eq("id", userId)
  if (usersErr) throw new Error(`users region: ${usersErr.message}`)

  const { error: authErr } = await admin.auth.admin.updateUserById(userId, {
    user_metadata: {
      preferred_language: language,
      preferred_currency: currency,
      funding_country_code: code,
    },
  })
  if (authErr) throw new Error(`auth metadata: ${authErr.message}`)

  return { funding_country_code: code, preferred_language: language, preferred_currency: currency }
}

async function provision(
  email: string,
  password: string,
  tradingUserLevel: TradingLevel,
  country?: string,
  language?: AppLanguage,
) {
  const admin = createAdminClient()
  const now = new Date().toISOString()
  const normalized = email.trim().toLowerCase()

  let userId = await findAuthUserIdByEmail(admin, normalized)
  let created = false

  if (!userId) {
    const { data, error } = await admin.auth.admin.createUser({
      email: normalized,
      password,
      email_confirm: true,
      user_metadata: { full_name: normalized.split("@")[0] ?? "Test" },
    })
    if (error) throw new Error(`${normalized}: createUser ${error.message}`)
    userId = data.user.id
    created = true
  } else {
    const { error } = await admin.auth.admin.updateUserById(userId, {
      email_confirm: true,
      password,
    })
    if (error) throw new Error(`${normalized}: updateUser ${error.message}`)
  }

  const referral_code = referralCodeForUserId(userId)
  const { error: profErr } = await admin.from("profiles").upsert(
    {
      id: userId,
      email: normalized,
      full_name: normalized.split("@")[0] ?? "Test",
      is_verified: true,
      trading_user_level: tradingUserLevel,
      referral_code,
      updated_at: now,
    },
    { onConflict: "id" },
  )
  if (profErr) throw new Error(`${normalized}: profiles ${profErr.message}`)

  const { error: usersErr } = await admin.from("users").upsert(
    {
      id: userId,
      role: "USER",
      level: tradingUserLevel,
      verified: true,
      updated_at: now,
    },
    { onConflict: "id" },
  )
  if (usersErr) throw new Error(`${normalized}: users ${usersErr.message}`)

  const { error: balErr } = await admin.from("user_balances").upsert(
    {
      user_id: userId,
      total_earnings: 0,
      current_stake: 0,
      available_balance: 0,
      last_updated: now,
    },
    { onConflict: "user_id" },
  )
  if (balErr) throw new Error(`${normalized}: balances ${balErr.message}`)

  await admin.from("email_verifications").delete().eq("user_id", userId)

  const regional =
    country != null && country.length === 2
      ? await applyOperatingCountry(admin, userId, country, language)
      : null

  return {
    email: normalized,
    userId,
    created,
    referral_code,
    trading_user_level: tradingUserLevel,
    ...regional,
  }
}

async function main() {
  const specs = process.argv.slice(2).map((e) => e.trim()).filter(Boolean).map(parseArg)
  if (!specs.length) {
    console.error(
      "Usage: npx tsx scripts/provision-verified-test-users.ts <email[:level[:ISO2[:lang]]]> ...",
    )
    process.exit(1)
  }
  const password = (process.env.TEST_USER_PASSWORD ?? "NexusTest!Richard2026").trim()
  const users = []
  for (const { email, level, country, language } of specs) {
    users.push(await provision(email, password, level, country, language))
  }
  console.log(JSON.stringify({ ok: true, password, users }, null, 2))
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
