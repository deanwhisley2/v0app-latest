/**
 * Pass/fail checks for master liquidity + withdrawal recycle wiring (no DB).
 * Run: npx tsx scripts/master-liquidity-architecture-check.ts
 */

import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { masterLiquidityStrictEnabled } from "../lib/server/admin-retail-pool"

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`)
}

function read(p: string): string {
  return readFileSync(resolve(process.cwd(), p), "utf8")
}

function main() {
  const k = "NEXUS_MASTER_LIQUIDITY_STRICT"
  const prev = process.env[k]
  try {
    delete process.env[k]
    assert(!masterLiquidityStrictEnabled(), "strict off when unset")
    process.env[k] = "1"
    assert(masterLiquidityStrictEnabled(), "strict on when NEXUS_MASTER_LIQUIDITY_STRICT=1")
    process.env[k] = "0"
    assert(!masterLiquidityStrictEnabled(), "strict off when 0")
  } finally {
    if (prev === undefined) delete process.env[k]
    else process.env[k] = prev
  }

  const mig = read("supabase/migrations/20260511173000_master_liquidity_withdrawals.sql")
  assert(mig.includes("under_review"), "migration allows under_review withdrawal status")
  assert(mig.includes("payout_status"), "migration adds payout_status")
  assert(mig.includes("recycled_pending_external"), "migration payout_state includes recycle")

  const desk = read("app/api/admin/operations-desk/route.ts")
  assert(desk.includes("user_withdrawal"), "operations desk merges user_withdrawal")
  assert(desk.includes("withdrawal_requests"), "operations desk queries withdrawal_requests")

  const patch = read("app/api/admin/withdrawal-requests/route.ts")
  assert(patch.includes("creditMasterLiquidityFromApprovedWithdrawal"), "approve recycles liquidity")
  assert(patch.includes("decision must be approve"), "withdrawal PATCH validates decision envelope")

  const panel = read("components/dashboard/wallet-operational-panel.tsx")
  assert(panel.includes("user_withdrawal"), "L5 desk UI understands user_withdrawal")
  assert(panel.includes("/api/admin/withdrawal-requests"), "desk PATCH hits withdrawal-requests")

  const wr = read("app/api/user/withdrawal/request/route.ts")
  assert(wr.includes("destination_hint"), "user withdrawal persists destination hint metadata")

  console.log("master-liquidity-architecture-check: PASS (9 architecture checks)")
}

main()
