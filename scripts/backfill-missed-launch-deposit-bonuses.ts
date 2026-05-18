#!/usr/bin/env npx tsx
/**
 * Credit launch first-deposit + referrer bonuses for users who funded during an active
 * promotional window but never received referee_launch_deposit_bonus_at.
 *
 * Usage: npx tsx scripts/backfill-missed-launch-deposit-bonuses.ts [--dry-run]
 */
import { config } from "dotenv"
import { resolve } from "node:path"
import { createAdminClient } from "../lib/supabaseAdmin"
import { applyLaunchFundingPromotions } from "../lib/server/launch-funding-promotions"
import { getPlatformLaunchStatus, launchPromotionsActive } from "../lib/server/platform-launch"

config({ path: resolve(process.cwd(), ".env.local") })
config({ path: resolve(process.cwd(), ".env") })

type Candidate = {
  user_id: string
  email: string | null
  deposit_usd: number
  source_ref: string
}

async function loadCandidates(admin: ReturnType<typeof createAdminClient>): Promise<Candidate[]> {
  const { data: rows, error: qErr } = await admin
    .from("profiles")
    .select("id, email, referee_launch_deposit_bonus_at")
    .is("referee_launch_deposit_bonus_at", null)

  if (qErr) throw new Error(qErr.message)

  const out: Candidate[] = []
  for (const p of rows ?? []) {
    const userId = String(p.id)
    const { data: fundRows } = await admin
      .from("retailer_fund_requests")
      .select("id, amount_usd_locked, status, retailer_approved_at, reviewed_at")
      .eq("user_id", userId)
      .eq("status", "approved")
      .order("created_at", { ascending: true })
      .limit(1)

    const fr = fundRows?.[0] as
      | {
          id: string
          amount_usd_locked?: unknown
          retailer_approved_at?: string | null
          reviewed_at?: string | null
        }
      | undefined
    if (!fr) continue

    const depositUsd = Number(fr.amount_usd_locked ?? 0)
    if (!(depositUsd > 0)) continue

    out.push({
      user_id: userId,
      email: typeof p.email === "string" ? p.email : null,
      deposit_usd: depositUsd,
      source_ref: `backfill_missed:fund_req:${fr.id}`,
    })
  }
  return out
}

async function main() {
  const dryRun = process.argv.includes("--dry-run")
  const admin = createAdminClient()
  const launch = await getPlatformLaunchStatus(true)
  if (!launchPromotionsActive(launch)) {
    console.error("Launch promotions are not active — apply global launch migration first.")
    process.exit(1)
  }

  const candidates = await loadCandidates(admin)
  const results: Array<{ email: string | null; user_id: string; deposit_usd: number; ok: boolean }> = []

  for (const c of candidates) {
    if (dryRun) {
      results.push({ email: c.email, user_id: c.user_id, deposit_usd: c.deposit_usd, ok: true })
      continue
    }
    await applyLaunchFundingPromotions(admin, c.user_id, c.deposit_usd, c.source_ref)
    const { data: prof } = await admin
      .from("profiles")
      .select("referee_launch_deposit_bonus_at")
      .eq("id", c.user_id)
      .maybeSingle()
    results.push({
      email: c.email,
      user_id: c.user_id,
      deposit_usd: c.deposit_usd,
      ok: Boolean(prof?.referee_launch_deposit_bonus_at),
    })
  }

  console.log(JSON.stringify({ dryRun, launchSlug: launch.slug, count: results.length, results }, null, 2))
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
