#!/usr/bin/env npx tsx
/**
 * Deletes auth user + dependent public rows (best-effort) then auth.admin.deleteUser.
 * Identifier: username (profiles.username), full email, or email local-part style slug.
 *
 * Usage: npx tsx scripts/delete-auth-user-by-identifier.ts <identifier>
 * Requires .env.local: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 */
import { config } from "dotenv"
import { resolve } from "node:path"
import { createAdminClient } from "../lib/supabaseAdmin"
import { resolveIdentifierToEmail } from "../lib/server/auth-identifier"

config({ path: resolve(process.cwd(), ".env.local") })
config({ path: resolve(process.cwd(), ".env") })

const TABLES_WITH_USER_ID = [
  "email_verifications",
  "user_balances",
  "user_account_notifications",
] as const

async function resolveUserId(admin: ReturnType<typeof createAdminClient>, raw: string): Promise<string | null> {
  const q = raw.trim()
  if (!q) return null
  const lower = q.toLowerCase()

  const { data: byUsername, error: uErr } = await admin
    .from("profiles")
    .select("id")
    .eq("username", lower)
    .maybeSingle()
  if (uErr && !/column.*username|does not exist/i.test(uErr.message)) {
    console.warn("[lookup username]", uErr.message)
  }
  if (byUsername?.id) return byUsername.id as string

  const email = await resolveIdentifierToEmail(admin, q)
  if (email) {
    const { data: byEmail, error: eErr } = await admin.from("profiles").select("id").eq("email", email).maybeSingle()
    if (eErr) console.warn("[lookup email]", eErr.message)
    if (byEmail?.id) return byEmail.id as string
  }

  const { data: localRows, error: lErr } = await admin
    .from("profiles")
    .select("id")
    .ilike("email", `${lower}@%`)
    .limit(2)
  if (lErr) console.warn("[lookup local-part]", lErr.message)
  if (localRows?.length === 1) return (localRows[0] as { id: string }).id

  return null
}

async function main() {
  const identifier = process.argv[2]?.trim()
  if (!identifier) {
    console.error("Usage: npx tsx scripts/delete-auth-user-by-identifier.ts <username-or-email>")
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
    .select("id, email, username, full_name")
    .eq("id", userId)
    .maybeSingle()
  console.log("Resolved user:", { userId, profile: prof })

  for (const table of TABLES_WITH_USER_ID) {
    const { error } = await admin.from(table).delete().eq("user_id", userId)
    if (error && !/relation|does not exist/i.test(error.message)) {
      console.warn(`[warn] delete from ${table}:`, error.message)
    } else if (!error) {
      console.log(`[ok] cleared ${table}`)
    }
  }

  const { error: delErr } = await admin.auth.admin.deleteUser(userId)
  if (delErr) {
    console.error("[fail] auth.admin.deleteUser:", delErr.message)
    process.exit(1)
  }
  console.log("[ok] auth user deleted:", userId)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
