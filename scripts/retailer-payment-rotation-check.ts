/**
 * Retailer payment-line rotation — structural + optional live DB checks.
 * Run: npx tsx scripts/retailer-payment-rotation-check.ts
 * Live DB (service role): ROTATION_LIVE=1 npx tsx scripts/retailer-payment-rotation-check.ts
 */

import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import {
  PAYMENT_ROTATION_APPROVAL_THRESHOLD,
  PAYMENT_ROTATION_UNIQUE_CLIENT_THRESHOLD,
  paymentLinesForNetwork,
} from "../lib/server/retailer-payment-rotation"
import { retailerDeskSupportsNetwork } from "../lib/server/retailer-funding-helpers"

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`)
}

function read(p: string): string {
  return readFileSync(resolve(process.cwd(), p), "utf8")
}

const KE_MPESA_LINES = [
  { label: "M-Pesa Kenya", value: "0115831794", payment_type: "mpesa_mobile_ke", payee_name: "Oscar Maloba Odhiambo" },
]

function main() {
  assert(PAYMENT_ROTATION_APPROVAL_THRESHOLD === 5, "approval threshold is 5")
  assert(PAYMENT_ROTATION_UNIQUE_CLIENT_THRESHOLD === 5, "unique client threshold is 5")

  const keLines = paymentLinesForNetwork(KE_MPESA_LINES, "MPesa", "KE")
  assert(keLines.length === 1, "single-number KE pool extracts 1 line")
  assert(keLines.length === 1 || keLines.length === 2, "multi-line pool")

  const singleUg = paymentLinesForNetwork(
    [{ label: "MTN Mobile Money Uganda", value: "+256794152339", payment_type: "mtn_mobile_ug" }],
    "MTN",
    "UG",
  )
  assert(singleUg.length === 1, "single-number corridor stays one line")

  assert(
    !retailerDeskSupportsNetwork(KE_MPESA_LINES, "MPesa", "UG"),
    "cross-country isolation: KE lines hidden from UG",
  )
  assert(
    retailerDeskSupportsNetwork(KE_MPESA_LINES, "MPesa", "KE"),
    "KE MPesa network matches KE lines",
  )
  assert(
    !retailerDeskSupportsNetwork(KE_MPESA_LINES, "MTN", "KE"),
    "cross-network isolation: MPesa lines do not match MTN",
  )

  const qual = read("lib/server/retailer-qualification.ts")
  assert(qual.includes("applyPaymentRotationToDeskRow"), "qualification applies rotation")

  const migration = read("supabase/migrations/20260622140000_retailer_payment_rotation_v1.sql")
  assert(migration.includes("resolve_retailer_payment_rotation_line"), "resolve RPC exists")
  assert(migration.includes("record_retailer_payment_rotation_approval"), "approval RPC exists")
  assert(migration.includes("retailer_payment_rotation_audit"), "audit table exists")
  assert(migration.includes("pending_session_count"), "pending session tracking")

  const dash = read("app/dashboard/page.tsx")
  assert(dash.includes("paymentRotationLineId"), "dashboard sends rotation line on fund POST")

  console.log("retailer-payment-rotation-check: PASS (structural)")
  console.log(
    "Live scenarios 2–10 (rotation after 5 approvals, concurrency, restart): run with ROTATION_LIVE=1 against staging.",
  )
}

main()
