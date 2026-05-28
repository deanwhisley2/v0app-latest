#!/usr/bin/env npx tsx
/**
 * Clear PIN + all payout lines for a test user (balances/history untouched).
 *
 * Usage: npx tsx scripts/reset-user-security-profile.ts <username-or-email>
 */
import { config } from "dotenv"
import { resolve } from "node:path"
import { createAdminClient } from "../lib/supabaseAdmin"
import { resolveIdentifierToEmail } from "../lib/server/auth-identifier"

config({ path: resolve(process.cwd(), ".env.local") })
config({ path: resolve(process.cwd(), ".env") })

async function resolveUserId(admin: ReturnType<typeof createAdminClient>, raw: string): Promise<string | null> {
  const q = raw.trim().toLowerCase()
  if (!q) return null

  const { data: byUsername } = await admin.from("profiles").select("id").eq("username", q).maybeSingle()
  if (byUsername?.id) return byUsername.id as string

  const email = await resolveIdentifierToEmail(admin, raw)
  if (email) {
    const { data: byEmail } = await admin.from("profiles").select("id").eq("email", email).maybeSingle()
    if (byEmail?.id) return byEmail.id as string
  }

  const { data: localRows } = await admin.from("profiles").select("id").ilike("email", `${q}@%`).limit(2)
  if (localRows?.length === 1) return (localRows[0] as { id: string }).id

  return null
}

const CLEAR_PATCH = {
  security_code_hash: null,
  security_code_set_at: null,
  deposit_number: null,
  withdrawal_number: null,
  deposit_account_names: null,
  withdrawal_account_names: null,
  mtn_deposit_number: null,
  mtn_deposit_account_names: null,
  airtel_deposit_number: null,
  airtel_deposit_account_names: null,
  mtn_withdrawal_number: null,
  mtn_withdrawal_account_names: null,
  airtel_withdrawal_number: null,
  airtel_withdrawal_account_names: null,
  crypto_wallet: null,
  payout_method: "mobile_money",
  cooldown_until: null,
  last_sensitive_change_at: null,
  updated_at: new Date().toISOString(),
}

async function main() {
  const identifier = process.argv[2]?.trim()
  if (!identifier) {
    console.error("Usage: npx tsx scripts/reset-user-security-profile.ts <username-or-email>")
    process.exit(1)
  }

  const admin = createAdminClient()
  const userId = await resolveUserId(admin, identifier)
  if (!userId) {
    console.error("No user found for:", identifier)
    process.exit(1)
  }

  const { data: prof } = await admin
    .from("profiles")
    .select("id,email,username,full_name")
    .eq("id", userId)
    .maybeSingle()
  console.log("Target:", prof)

  const { error: secErr } = await admin.from("user_security_profiles").upsert(
    { user_id: userId, ...CLEAR_PATCH },
    { onConflict: "user_id" },
  )
  if (secErr) throw new Error(secErr.message)

  const { error: reqErr } = await admin.from("security_change_requests").delete().eq("user_id", userId)
  if (reqErr) throw new Error(reqErr.message)

  console.log("OK: security profile + change requests cleared for", userId)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
