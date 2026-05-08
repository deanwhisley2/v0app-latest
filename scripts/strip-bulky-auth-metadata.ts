#!/usr/bin/env npx tsx
/**
 * Removes avatar_url / selfie_image from Supabase Auth user_metadata (JWT source).
 * Run after deploying selfie JWT fix. Requires SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL in .env.local
 *
 * Usage: npx tsx scripts/strip-bulky-auth-metadata.ts
 */
import { config } from "dotenv"
import { resolve } from "node:path"
import { createAdminClient } from "../lib/supabaseAdmin"
import { mergeSafeUserMetadata } from "../lib/server/auth-jwt-metadata"

config({ path: resolve(process.cwd(), ".env.local") })
config({ path: resolve(process.cwd(), ".env") })

function metadataNeedsStrip(meta: Record<string, unknown>): boolean {
  return "avatar_url" in meta || "selfie_image" in meta
}

async function main() {
  const admin = createAdminClient()
  let page = 1
  const perPage = 200
  let scanned = 0
  let updated = 0
  let errors = 0

  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage })
    if (error) throw error
    for (const u of data.users) {
      scanned++
      const meta = (u.user_metadata ?? {}) as Record<string, unknown>
      if (!metadataNeedsStrip(meta)) continue

      const clean = mergeSafeUserMetadata(meta, {})
      const { error: upErr } = await admin.auth.admin.updateUserById(u.id, {
        user_metadata: clean,
      })
      if (upErr) {
        errors++
        console.error(`[fail] ${u.email ?? u.id}: ${upErr.message}`)
      } else {
        updated++
        console.log(`[ok] stripped JWT metadata for ${u.email ?? u.id}`)
      }
    }
    if (data.users.length < perPage) break
    page += 1
    if (page > 200) {
      console.warn("[warn] stopped at page 200 (safety cap)")
      break
    }
  }

  console.log(`\nDone. scanned=${scanned} updated=${updated} errors=${errors}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
