#!/usr/bin/env npx tsx
/**
 * Create or verify test auth users (email_confirm + profiles.is_verified + trading_user_level).
 * Usage:
 *   npx tsx scripts/provision-verified-test-users.ts email@example.com
 *   npx tsx scripts/provision-verified-test-users.ts email@example.com:2
 * Optional: TEST_USER_PASSWORD=... in env (default NexusTest!Richard2026)
 */
import { config } from "dotenv"
import { resolve } from "node:path"
import { createAdminClient } from "../lib/supabaseAdmin"
import { findAuthUserIdByEmail } from "../lib/auth-users"
import { referralCodeForUserId } from "../lib/referral-code"

config({ path: resolve(process.cwd(), ".env.local") })
config({ path: resolve(process.cwd(), ".env") })

type TradingLevel = 1 | 2 | 5

function parseArg(raw: string): { email: string; level: TradingLevel } {
  const trimmed = raw.trim()
  const colon = trimmed.lastIndexOf(":")
  if (colon > 0) {
    const maybeLevel = Number(trimmed.slice(colon + 1))
    if ([1, 2, 5].includes(maybeLevel)) {
      return { email: trimmed.slice(0, colon).trim().toLowerCase(), level: maybeLevel as TradingLevel }
    }
  }
  return { email: trimmed.toLowerCase(), level: 1 }
}

async function provision(email: string, password: string, tradingUserLevel: TradingLevel) {
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
    const { error } = await admin.auth.admin.updateUserById(userId, { email_confirm: true })
    if (error) throw new Error(`${normalized}: email_confirm ${error.message}`)
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

  return { email: normalized, userId, created, referral_code, trading_user_level: tradingUserLevel }
}

async function main() {
  const specs = process.argv.slice(2).map((e) => e.trim()).filter(Boolean).map(parseArg)
  if (!specs.length) {
    console.error(
      "Usage: npx tsx scripts/provision-verified-test-users.ts <email> [email:level] ... (level 1|2|5)",
    )
    process.exit(1)
  }
  const password = (process.env.TEST_USER_PASSWORD ?? "NexusTest!Richard2026").trim()
  const users = []
  for (const { email, level } of specs) {
    users.push(await provision(email, password, level))
  }
  console.log(JSON.stringify({ ok: true, password, users }, null, 2))
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
