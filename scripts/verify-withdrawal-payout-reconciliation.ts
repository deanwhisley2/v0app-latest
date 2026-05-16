#!/usr/bin/env npx tsx
/**
 * Withdrawal payout reconciliation — standard treasury QA after deploy.
 *
 * Usage:
 *   npm run verify:withdrawal-payout -- --help
 *   npm run verify:withdrawal-payout -- --audit-db
 *   npm run verify:withdrawal-payout -- --simulate 100
 *   npm run verify:withdrawal-payout -- --snapshot-user <userId>
 *   npm run verify:withdrawal-payout -- --request-id <uuid> [--snapshot-before <file.json>]
 *
 * Requires .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import { readFileSync, writeFileSync } from "node:fs"
import { config } from "dotenv"
import { resolve } from "node:path"
import { createAdminClient } from "../lib/supabaseAdmin"
import { adminRetailPoolUserId } from "../lib/server/admin-retail-pool"
import {
  assertWithdrawalSettlementConserved,
  computeWithdrawalProcessingSettlement,
  resolveWithdrawalSettlementFromRow,
  WITHDRAWAL_PROCESSING_FEE_RATE,
} from "../lib/server/withdrawal-processing-fee"

config({ path: resolve(process.cwd(), ".env.local") })
config({ path: resolve(process.cwd(), ".env") })

const TOLERANCE = 0.02

/** Customer notifications must not expose treasury/settlement internals. */
const BANNED_NOTIFICATION_SUBSTRINGS = [
  "treasury",
  "recycle",
  "main_treasury",
  "settlement",
  "operational pool",
  "payout handler",
  "master liquidity",
  "frozen bucket",
]

export type PayoutReconciliationSnapshot = {
  capturedAt: string
  userId: string
  available: number
  withdrawalPending: number
  poolAvailable: number | null
  poolUserIdMasked: string | null
  latestWithdrawalRequestId: string | null
  latestWithdrawalStatus: string | null
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function parseArgs(argv: string[]) {
  const simulateIdx = argv.indexOf("--simulate")
  const audit = argv.includes("--audit-db")
  const reqIdx = argv.indexOf("--request-id")
  const requestId = reqIdx >= 0 ? argv[reqIdx + 1] : undefined
  const userIdx = argv.indexOf("--snapshot-user")
  const snapshotUserId = userIdx >= 0 ? argv[userIdx + 1] : undefined
  const beforeIdx = argv.indexOf("--snapshot-before")
  const snapshotBeforePath = beforeIdx >= 0 ? argv[beforeIdx + 1] : undefined
  const simulateGross = simulateIdx >= 0 ? Number(argv[simulateIdx + 1]) : undefined
  const writeIdx = argv.indexOf("--write-snapshot")
  const writeSnapshotPath = writeIdx >= 0 ? argv[writeIdx + 1] : undefined
  return {
    audit,
    requestId,
    snapshotUserId,
    snapshotBeforePath,
    simulateGross,
    writeSnapshotPath,
  }
}

function printChecklist() {
  console.log(`
WITHDRAWAL PAYOUT QA (post-deploy fee-aware rows required)

Standard flow after every payout/treasury deploy:
  1. npm run verify:withdrawal-payout -- --audit-db
  2. Per isolated test user:
     npm run verify:withdrawal-payout -- --snapshot-user <userId> --write-snapshot before.json
  3. Submit withdrawal (dashboard) — small / large / UGX-context
  4. npm run verify:withdrawal-payout -- --snapshot-user <userId>  (after submit)
  5. L5 approve OR reject (separate tests)
  6. npm run verify:withdrawal-payout -- --request-id <id> --snapshot-before before.json
  7. Archive PASS/FAIL + request id in ops log

Tests required (fee-aware rows only — created after deploy 243e4d3+):
  [ ] small gross — submit → approve → reconcile
  [ ] large gross — submit → approve → reconcile
  [ ] UGX-context — verify row.amount is USD ledger gross
  [ ] reject — full gross refund, fee 0, no pool credit
  [ ] double-action — second PATCH returns 400

Canonical API: POST /api/user/withdrawal/request
Legacy /api/withdrawal → 410 WITHDRAWAL_ROUTE_DEPRECATED
`)
}

async function captureSnapshot(userId: string): Promise<PayoutReconciliationSnapshot> {
  const admin = createAdminClient()
  const { data: bal, error: balErr } = await admin
    .from("user_balances")
    .select("available_balance,withdrawal_pending_balance")
    .eq("user_id", userId)
    .maybeSingle()
  if (balErr) throw new Error(balErr.message)

  const { data: latest } = await admin
    .from("withdrawal_requests")
    .select("id,status,amount,processing_fee_rate,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  const poolUid = adminRetailPoolUserId()
  let poolAvailable: number | null = null
  let poolUserIdMasked: string | null = null
  if (poolUid) {
    const { data: poolBal } = await admin
      .from("user_balances")
      .select("available_balance")
      .eq("user_id", poolUid)
      .maybeSingle()
    poolAvailable = round2(Number(poolBal?.available_balance ?? 0))
    poolUserIdMasked = `${poolUid.slice(0, 8)}…`
  }

  return {
    capturedAt: new Date().toISOString(),
    userId,
    available: round2(Number(bal?.available_balance ?? 0)),
    withdrawalPending: round2(Number(bal?.withdrawal_pending_balance ?? 0)),
    poolAvailable,
    poolUserIdMasked,
    latestWithdrawalRequestId: latest?.id ? String(latest.id) : null,
    latestWithdrawalStatus: latest?.status ? String(latest.status) : null,
  }
}

function printSnapshot(s: PayoutReconciliationSnapshot) {
  console.log(JSON.stringify(s, null, 2))
}

function compareSnapshots(
  before: PayoutReconciliationSnapshot,
  after: PayoutReconciliationSnapshot,
  settlement: { grossAmount: number; payoutAmount: number; status: string },
): boolean {
  const dAvail = round2(after.available - before.available)
  const dPending = round2(after.withdrawalPending - before.withdrawalPending)
  const dPool =
    before.poolAvailable != null && after.poolAvailable != null
      ? round2(after.poolAvailable - before.poolAvailable)
      : null

  console.log("\n--- before/after deltas ---")
  console.log("available Δ:", dAvail)
  console.log("withdrawal_pending Δ:", dPending)
  if (dPool != null) console.log("pool available Δ:", dPool)

  let ok = true
  if (settlement.status === "pending" || settlement.status === "under_review") {
    const expectAvail = round2(-settlement.grossAmount)
    const expectPending = settlement.grossAmount
    if (Math.abs(dAvail - expectAvail) > TOLERANCE) {
      console.error(`FAIL: expected available Δ ≈ ${expectAvail}, got ${dAvail}`)
      ok = false
    }
    if (Math.abs(dPending - expectPending) > TOLERANCE) {
      console.error(`FAIL: expected withdrawal_pending Δ ≈ +${expectPending}, got ${dPending}`)
      ok = false
    }
  }
  if (settlement.status === "approved" && dPool != null) {
    if (Math.abs(dPool - settlement.payoutAmount) > TOLERANCE) {
      console.error(`FAIL: expected pool Δ ≈ payout ${settlement.payoutAmount}, got ${dPool}`)
      ok = false
    }
  }
  if (settlement.status === "rejected") {
    if (dPool != null && Math.abs(dPool) > TOLERANCE) {
      console.error("FAIL: reject must not credit treasury pool")
      ok = false
    }
  }
  return ok
}

async function auditNotifications(userId: string, requestId: string): Promise<boolean> {
  const admin = createAdminClient()
  const { data: all } = await admin
    .from("user_account_notifications")
    .select("title,body,source_kind,source_id,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(40)
  const rows = (all ?? []).filter(
    (n) =>
      String(n.source_id ?? "") === requestId ||
      String(n.source_id ?? "").includes(requestId),
  )

  let ok = true
  console.log("\n--- customer notifications (wording audit) ---")
  for (const n of rows ?? []) {
    const text = `${n.title ?? ""} ${n.body ?? ""}`.toLowerCase()
    const hits = BANNED_NOTIFICATION_SUBSTRINGS.filter((b) => text.includes(b))
    console.log(`  [${n.source_kind}] ${String(n.title ?? "").slice(0, 40)}`)
    if (hits.length) {
      console.error(`    BANNED TERMS: ${hits.join(", ")}`)
      ok = false
    }
  }
  if (!rows?.length) console.log("  (no notifications matched — check manually)")
  return ok
}

async function auditDatabase(): Promise<boolean> {
  const admin = createAdminClient()
  const { data: rows, error } = await admin
    .from("withdrawal_requests")
    .select(
      "id,amount,processing_fee_amount,payout_amount,processing_fee_rate,status,created_at",
    )
    .order("created_at", { ascending: false })
    .limit(500)
  if (error) throw new Error(error.message)

  let violations = 0
  let legacy = 0
  let withFee = 0
  const deployCutoff = "2026-05-16T00:00:00.000Z"
  let postDeployFeeAware = 0
  for (const row of rows ?? []) {
    const s = resolveWithdrawalSettlementFromRow(row)
    try {
      assertWithdrawalSettlementConserved(s)
    } catch {
      violations++
      console.error("CONSERVATION FAIL", row.id, row)
    }
    if (s.legacyNoProcessingFee) legacy++
    else withFee++
    if (
      !s.legacyNoProcessingFee &&
      String(row.created_at ?? "") >= deployCutoff
    ) {
      postDeployFeeAware++
    }
  }
  console.log(`withdrawal_requests scanned: ${rows?.length ?? 0}`)
  console.log(`  legacy (no fee): ${legacy}`)
  console.log(`  fee-aware rows: ${withFee}`)
  console.log(`  post-deploy fee-aware (since ${deployCutoff}): ${postDeployFeeAware}`)
  console.log(`  conservation violations: ${violations}`)
  if (postDeployFeeAware === 0) {
    console.log("\nNOTE: No post-deploy fee-aware rows yet — live payout tests still required.")
  }
  return violations === 0
}

async function verifyRequest(
  requestId: string,
  snapshotBeforePath?: string,
): Promise<boolean> {
  const admin = createAdminClient()
  const { data: row, error } = await admin
    .from("withdrawal_requests")
    .select(
      "id,user_id,amount,processing_fee_amount,payout_amount,processing_fee_rate,currency_context,status,payout_status,transaction_ref,metadata,created_at,reviewed_at",
    )
    .eq("id", requestId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!row) {
    console.error("Request not found:", requestId)
    return false
  }

  const settlement = resolveWithdrawalSettlementFromRow(row)
  assertWithdrawalSettlementConserved(settlement)

  if (!settlement.legacyNoProcessingFee) {
    console.log("fee-aware row: OK (post-fee pipeline)")
  } else {
    console.log("legacy row: conservation OK (pre-fee era)")
  }

  const meta = (row.metadata as Record<string, unknown>) ?? {}
  const userId = String(row.user_id)
  const status = String(row.status)

  console.log("\n--- withdrawal request ---")
  console.log("id:", row.id)
  console.log("status:", status, "payout_status:", row.payout_status)
  console.log("currency_context:", row.currency_context)
  console.log("gross:", settlement.grossAmount)
  console.log("fee:", settlement.processingFeeAmount, `(${(settlement.processingFeeRate * 100).toFixed(1)}%)`)
  console.log("payout:", settlement.payoutAmount)

  const afterSnap = await captureSnapshot(userId)
  printSnapshot(afterSnap)

  if (snapshotBeforePath) {
    const before = JSON.parse(readFileSync(snapshotBeforePath, "utf8")) as PayoutReconciliationSnapshot
    const deltaOk = compareSnapshots(before, afterSnap, {
      grossAmount: settlement.grossAmount,
      payoutAmount: settlement.payoutAmount,
      status,
    })
    if (!deltaOk) return false
  }

  const poolUid = adminRetailPoolUserId()
  if (poolUid) {
    console.log("\n--- treasury pool (current) ---")
    console.log("pool available:", afterSnap.poolAvailable)
  }

  if (status === "approved") {
    const recycled = meta.recycle_applied_usd != null ? Number(meta.recycle_applied_usd) : NaN
    const feeRetained =
      meta.processing_fee_retained_usd != null
        ? Number(meta.processing_fee_retained_usd)
        : settlement.processingFeeAmount
    console.log("\n--- approve metadata ---")
    console.log("recycle_applied_usd:", recycled)
    console.log("processing_fee_retained_usd:", feeRetained)
    const recycleOk =
      settlement.legacyNoProcessingFee
        ? Math.abs(recycled - settlement.grossAmount) <= TOLERANCE ||
          Math.abs(recycled - settlement.payoutAmount) <= TOLERANCE
        : Math.abs(recycled - settlement.payoutAmount) <= TOLERANCE
    const feeOk =
      settlement.legacyNoProcessingFee ||
      Math.abs(feeRetained - settlement.processingFeeAmount) <= TOLERANCE
    console.log("recycle matches payout (fee-aware):", recycleOk)
    console.log("fee retained recorded:", feeOk)
    if (!recycleOk) return false
    if (!feeOk && !settlement.legacyNoProcessingFee) return false
  }

  if (status === "rejected") {
    const feeOk = settlement.processingFeeAmount === 0 || settlement.legacyNoProcessingFee
    console.log("\n--- reject invariants ---")
    console.log("no fee retained on row:", feeOk)
    if (!feeOk) return false
  }

  const { data: byRef } = await admin
    .from("container_balance_events")
    .select("event_type,gross_amount,fee_amount,net_amount,status,summary,created_at,metadata")
    .eq("transaction_ref", row.transaction_ref)
    .order("created_at", { ascending: false })
    .limit(10)
  console.log("\n--- financial events ---")
  for (const ev of byRef ?? []) {
    console.log(
      `  ${ev.event_type} gross=${ev.gross_amount} fee=${ev.fee_amount} net=${ev.net_amount} [${ev.status}]`,
    )
    const summary = String(ev.summary ?? "").toLowerCase()
    const bad = BANNED_NOTIFICATION_SUBSTRINGS.filter((b) => summary.includes(b))
    if (bad.length && ev.event_type === "withdrawal_pending") {
      console.warn(`    (ops event may use internal wording: ${bad.join(", ")})`)
    }
  }

  const notifyOk = await auditNotifications(userId, requestId)

  console.log(notifyOk ? "\nPASS: request reconciliation checks OK" : "\nFAIL: notification wording")
  return notifyOk
}

function simulate(gross: number) {
  const s = computeWithdrawalProcessingSettlement(gross)
  assertWithdrawalSettlementConserved(s)
  console.log(`Rate: ${WITHDRAWAL_PROCESSING_FEE_RATE * 100}%`)
  console.log(`Gross:  ${s.grossAmount}`)
  console.log(`Fee:    ${s.processingFeeAmount}`)
  console.log(`Payout: ${s.payoutAmount}`)
}

async function main() {
  const {
    audit,
    requestId,
    snapshotUserId,
    snapshotBeforePath,
    simulateGross,
    writeSnapshotPath,
  } = parseArgs(process.argv.slice(2))

  if (process.argv.includes("--help") || process.argv.length <= 2) {
    printChecklist()
    process.exit(0)
  }

  let ok = true
  if (simulateGross != null && Number.isFinite(simulateGross)) {
    simulate(simulateGross)
  } else if (snapshotUserId) {
    const snap = await captureSnapshot(snapshotUserId)
    if (writeSnapshotPath) {
      writeFileSync(writeSnapshotPath, JSON.stringify(snap, null, 2))
      console.log(`Wrote ${writeSnapshotPath}`)
    }
    printSnapshot(snap)
  } else if (audit) {
    ok = await auditDatabase()
  } else if (requestId) {
    ok = await verifyRequest(requestId, snapshotBeforePath)
  } else {
    printChecklist()
    process.exit(1)
  }
  process.exit(ok ? 0 : 1)
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
