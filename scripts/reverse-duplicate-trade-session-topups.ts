/**
 * Ops: reverse duplicate trade-session reconcile top-up credits from Pocket.
 *
 *   npx tsx scripts/reverse-duplicate-trade-session-topups.ts --dry-run
 *   npx tsx scripts/reverse-duplicate-trade-session-topups.ts --apply
 */

import { config } from "dotenv"
import { resolve } from "path"
import { createAdminClient } from "../lib/supabaseAdmin"
import { recordFinancialEvent } from "../lib/server/financial-events"
import { roundUsd2 } from "../lib/nexus-financial-policy"

config({ path: resolve(process.cwd(), ".env.local") })

const CORRECTIONS = [
  {
    userId: "1d2c24d2-0f1a-4707-b29d-2ba588be100c",
    label: "Kisumu Sahil",
    excessUsd: 188.14,
  },
  {
    userId: "f7cb0411-c2ae-40af-bcfe-7a149be88e92",
    label: "Nalutaaya Bushirah",
    excessUsd: 39.99,
  },
  {
    userId: "f226dace-b26c-4106-a4c1-1049dd0ed46b",
    label: "Wakulya Ivan",
    excessUsd: 0.75,
  },
] as const

function parseArgs(argv: string[]) {
  let apply = false
  let dryRun = true
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--apply") {
      apply = true
      dryRun = false
    } else if (argv[i] === "--dry-run") dryRun = true
  }
  return { apply, dryRun }
}

async function resolveUserId(
  admin: ReturnType<typeof createAdminClient>,
  row: (typeof CORRECTIONS)[number],
): Promise<string> {
  if (!row.userId.includes("0000-0000-0000")) return row.userId
  const hint = "emailHint" in row ? String(row.emailHint) : ""
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 })
  if (error) throw new Error(error.message)
  const hit = data.users.find((u) => {
    const email = (u.email ?? "").toLowerCase()
    return hint ? email.includes(hint) : false
  })
  if (!hit) throw new Error(`Could not resolve user id for ${row.label}`)
  return hit.id
}

async function debitBalancesUsd(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  targetUsd: number,
): Promise<{ pocketDebited: number; mainDebited: number; shortfallUsd: number }> {
  const target = roundUsd2(targetUsd)
  const { data: row, error: rErr } = await admin
    .from("user_balances")
    .select("available_balance, container_withdrawable_earnings")
    .eq("user_id", userId)
    .maybeSingle()
  if (rErr) throw new Error(rErr.message)
  if (!row) throw new Error(`Balance row not found for ${userId}`)

  let pocket = roundUsd2(Number(row.container_withdrawable_earnings ?? 0))
  let main = roundUsd2(Number(row.available_balance ?? 0))
  let remaining = target
  let pocketDebited = 0
  let mainDebited = 0

  if (pocket > 0 && remaining > 0) {
    pocketDebited = roundUsd2(Math.min(pocket, remaining))
    pocket = roundUsd2(pocket - pocketDebited)
    remaining = roundUsd2(remaining - pocketDebited)
  }
  if (main > 0 && remaining > 0) {
    mainDebited = roundUsd2(Math.min(main, remaining))
    main = roundUsd2(main - mainDebited)
    remaining = roundUsd2(remaining - mainDebited)
  }

  const { error: uErr } = await admin
    .from("user_balances")
    .update({
      container_withdrawable_earnings: pocket,
      available_balance: main,
      last_updated: new Date().toISOString(),
    })
    .eq("user_id", userId)
  if (uErr) throw new Error(uErr.message)

  return { pocketDebited, mainDebited, shortfallUsd: remaining }
}

async function alreadyCorrected(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  amountUsd: number,
): Promise<boolean> {
  const key = `duplicate_topup_reversal:${userId}:${roundUsd2(amountUsd).toFixed(2)}`
  const { data, error } = await admin
    .from("container_balance_events")
    .select("id")
    .eq("user_id", userId)
    .eq("event_type", "ops_duplicate_topup_reversal")
    .contains("metadata", { idempotency_key: key })
    .limit(1)
  if (error) throw new Error(error.message)
  return Boolean(data && data.length > 0)
}

async function main() {
  const { apply, dryRun } = parseArgs(process.argv)
  const admin = createAdminClient()
  const results: Array<Record<string, unknown>> = []

  for (const row of CORRECTIONS) {
    const userId = await resolveUserId(admin, row)
    const excessUsd = roundUsd2(row.excessUsd)
    const idempotencyKey = `duplicate_topup_reversal:${userId}:${excessUsd.toFixed(2)}`
    const skipped = await alreadyCorrected(admin, userId, excessUsd)

    const entry = {
      label: row.label,
      userId,
      excessUsd,
      skipped,
      dryRun: !apply,
    }
    console.log("correction_plan", entry)

    if (skipped) {
      results.push({ ...entry, status: "already_corrected" })
      continue
    }

    if (dryRun) {
      results.push({ ...entry, status: "dry_run" })
      continue
    }

    const { pocketDebited, mainDebited, shortfallUsd } = await debitBalancesUsd(
      admin,
      userId,
      excessUsd,
    )
    const recoveredUsd = roundUsd2(pocketDebited + mainDebited)
    await recordFinancialEvent({
      userId,
      eventType: "ops_duplicate_topup_reversal",
      category: "admin",
      amount: recoveredUsd,
      balanceSource:
        pocketDebited > 0 && mainDebited > 0
          ? "container_withdrawable_earnings,available_balance"
          : mainDebited > 0
            ? "available_balance"
            : "container_withdrawable_earnings",
      balanceDestination: "treasury_correction",
      status: shortfallUsd > 0 ? "completed" : "completed",
      actorType: "admin",
      actorId: userId,
      summary:
        shortfallUsd > 0
          ? `Treasury correction — partial reverse duplicate top-ups (${recoveredUsd.toFixed(2)} USD recovered, ${shortfallUsd.toFixed(2)} USD shortfall).`
          : `Treasury correction — reverse duplicate trade-session reconcile top-ups (${recoveredUsd.toFixed(2)} USD).`,
      metadata: {
        idempotency_key: idempotencyKey,
        target_excess_usd: excessUsd,
        pocket_debited_usd: pocketDebited,
        main_debited_usd: mainDebited,
        shortfall_usd: shortfallUsd,
        reason: "duplicate_nexus_trade_session_reconcile_topup",
        ops_reversal: true,
      },
    })
    results.push({
      ...entry,
      status: shortfallUsd > 0 ? "partial" : "applied",
      pocketDebited,
      mainDebited,
      shortfallUsd,
    })
  }

  console.log(JSON.stringify({ ok: true, apply, results }, null, 2))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
