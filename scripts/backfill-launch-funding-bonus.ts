#!/usr/bin/env npx tsx
/**
 * One-off: apply launch first-deposit + referral bonuses for a user who funded before promotions shipped.
 * Usage: npx tsx scripts/backfill-launch-funding-bonus.ts <email> <deposit_usd>
 */
import { config } from "dotenv"
import { resolve } from "node:path"
import { createAdminClient } from "../lib/supabaseAdmin"
import { findAuthUserIdByEmail } from "../lib/auth-users"
import { applyLaunchFundingPromotions } from "../lib/server/launch-funding-promotions"

config({ path: resolve(process.cwd(), ".env.local") })

async function main() {
  const email = process.argv[2]?.trim()
  const usd = Number(process.argv[3] ?? 0)
  if (!email || !(usd > 0)) {
    console.error("Usage: npx tsx scripts/backfill-launch-funding-bonus.ts <email> <deposit_usd>")
    process.exit(1)
  }
  const admin = createAdminClient()
  const userId = await findAuthUserIdByEmail(admin, email)
  if (!userId) {
    console.error("User not found:", email)
    process.exit(1)
  }
  await applyLaunchFundingPromotions(admin, userId, usd, `backfill:${email}`)
  const { data: bal } = await admin.from("user_balances").select("available_balance").eq("user_id", userId).maybeSingle()
  console.log(JSON.stringify({ ok: true, userId, email, available_balance: bal?.available_balance }, null, 2))
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
