#!/usr/bin/env npx tsx
/**
 * Removes enrolled security selfie: clears profiles.avatar_url and selfie-related Auth metadata.
 * Usage: npx tsx scripts/delete-user-security-selfie.ts <email>
 *
 * Requires .env.local with NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
 */
import { config } from "dotenv"
import { resolve } from "node:path"
import { createAdminClient } from "../lib/supabaseAdmin"
import { findAuthUserIdByEmail } from "../lib/auth-users"
import { mergeSafeUserMetadata } from "../lib/server/auth-jwt-metadata"

config({ path: resolve(process.cwd(), ".env.local") })
config({ path: resolve(process.cwd(), ".env") })

const SELFIE_META_KEYS = [
  "selfie_hash",
  "selfie_enrolled_at",
  "security_selfie_enrolled",
  "avatar_url",
  "selfie_image",
] as const

async function main() {
  const email = process.argv[2]?.trim()
  if (!email) {
    console.error("Usage: npx tsx scripts/delete-user-security-selfie.ts <email>")
    process.exit(1)
  }

  const admin = createAdminClient()
  const userId = await findAuthUserIdByEmail(admin, email)
  if (!userId) {
    console.error("No auth user found for:", email)
    process.exit(1)
  }

  const nowIso = new Date().toISOString()

  const { error: profErr } = await admin
    .from("profiles")
    .update({ avatar_url: null, updated_at: nowIso })
    .eq("id", userId)
  if (profErr) throw profErr
  console.log("[ok] profiles.avatar_url cleared")

  const { data: userData, error: getErr } = await admin.auth.admin.getUserById(userId)
  if (getErr || !userData?.user) throw getErr ?? new Error("getUserById failed")

  const meta = { ...(userData.user.user_metadata ?? {}) } as Record<string, unknown>
  for (const k of SELFIE_META_KEYS) {
    delete meta[k]
  }
  const clean = mergeSafeUserMetadata(meta, {})

  const { error: metaErr } = await admin.auth.admin.updateUserById(userId, {
    user_metadata: clean,
  })
  if (metaErr) throw metaErr
  console.log("[ok] auth user_metadata selfie fields removed")

  console.log("\nDone. User should sign out / clear site cookies and sign in again.")
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
