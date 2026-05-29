#!/usr/bin/env npx tsx
/**
 * Credit missed new-member welcome bonus ($5.30 USD equiv) for eligible profiles.
 *
 * Usage: npx tsx scripts/backfill-new-member-welcome-bonus.ts [--dry-run]
 */
import { config } from "dotenv"
import { resolve } from "node:path"
import { createAdminClient } from "../lib/supabaseAdmin"
import {
  grantNewMemberWelcomeBonus,
  isProfileEligibleForNewMemberWelcome,
  newMemberWelcomeEligibleAfter,
} from "../lib/server/new-member-campaign"
import { getPlatformLaunchStatus } from "../lib/server/platform-launch"

config({ path: resolve(process.cwd(), ".env.local") })
config({ path: resolve(process.cwd(), ".env") })

async function main() {
  const dryRun = process.argv.includes("--dry-run")
  const admin = createAdminClient()
  const launch = await getPlatformLaunchStatus(true)
  const cutoff = newMemberWelcomeEligibleAfter(launch.programs)

  const { data: rows, error } = await admin
    .from("profiles")
    .select("id, email, created_at, startup_bonus_received_at")
    .is("startup_bonus_received_at", null)
    .gte("created_at", cutoff)
    .order("created_at", { ascending: true })

  if (error) throw new Error(error.message)

  const candidates = []
  for (const row of rows ?? []) {
    const userId = String(row.id)
    if (!(await isProfileEligibleForNewMemberWelcome(admin, userId, launch.programs))) continue
    candidates.push(row)
  }

  console.log(`Cutoff: ${cutoff}`)
  console.log(`Eligible without bonus: ${candidates.length}${dryRun ? " (dry-run)" : ""}`)

  let ok = 0
  let fail = 0
  for (const row of candidates) {
    const userId = String(row.id)
    const email = typeof row.email === "string" ? row.email : userId
    if (dryRun) {
      console.log(`  would grant: ${email} (${row.created_at})`)
      ok++
      continue
    }
    const granted = await grantNewMemberWelcomeBonus(admin, userId, "registration")
    if (granted) {
      console.log(`  granted: ${email}`)
      ok++
    } else {
      console.warn(`  FAILED: ${email}`)
      fail++
    }
  }

  console.log(`Done. ok=${ok} fail=${fail}`)
  if (fail > 0) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
