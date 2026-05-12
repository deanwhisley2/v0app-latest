/**
 * Structural PASS/FAIL checks for H1 (liquidity reservations) + H6 (FX snapshot locking).
 * Run: npx tsx scripts/h1-h6-institutional-funding-check.ts
 */

import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { localFiatUnitsToUsd } from "../lib/currency-display"

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`)
}

function read(p: string): string {
  return readFileSync(resolve(process.cwd(), p), "utf8")
}

function main() {
  const mig = read("supabase/migrations/20260523100000_retailer_liquidity_reservations_and_fx_snapshot_locking.sql")
  assert(mig.includes("retailer_liquidity_reservations"), "migration creates reservations table")
  assert(mig.includes("create_retailer_desk_fund_request_with_reserve"), "migration defines atomic create RPC")
  assert(mig.includes("finalize_retailer_liquidity_reservation"), "migration defines finalize RPC")
  assert(mig.includes("transfer_retail_balance_to_customer_with_reservation"), "migration defines atomic settle RPC")
  assert(mig.includes("amount_usd_locked"), "migration adds FX lock column")

  const helpers = read("lib/server/retailer-funding-helpers.ts")
  assert(helpers.includes("sumActiveReservationsUsdForRetailer"), "helpers sum active reservations")
  assert(helpers.includes("settlementUsdFromFundRequestRow"), "helpers expose locked USD settlement")
  assert(helpers.includes("transfer_retail_balance_to_customer_with_reservation"), "helpers call reservation transfer RPC")

  const post = read("app/api/user/retailer-funding/route.ts")
  assert(post.includes("create_retailer_desk_fund_request_with_reserve"), "POST uses atomic desk create RPC")
  assert(post.includes("amountUsdLocked"), "POST derives authoritative USD lock")

  const admin = read("app/api/admin/retailer-funding/route.ts")
  assert(admin.includes("finalizeRetailerLiquidityReservation"), "admin releases reservations on reject/resolve/treasury desk")
  assert(admin.includes("settlementUsdFromFundRequestRow"), "admin settles using locked USD")

  const incoming = read("app/api/user/retailer-incoming-queue/route.ts")
  assert(incoming.includes("finalizeRetailerLiquidityReservation"), "retailer queue releases on reject")
  assert(incoming.includes("settlementUsdFromFundRequestRow"), "retailer queue uses locked USD")

  const dash = read("app/dashboard/page.tsx")
  assert(dash.includes("amountInputLocal"), "dashboard sends raw local amount for FX lock")

  const a = localFiatUnitsToUsd(375_000, "UGX")
  const b = localFiatUnitsToUsd(375_000, "UGX")
  assert(Math.abs(a - b) < 1e-9, "FX snapshot helper is deterministic for immutability regression guard")

  console.log("h1-h6-institutional-funding-check: PASS")
}

main()
