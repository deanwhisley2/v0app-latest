/**
 * Structural PASS/FAIL checks for Local MM funding flow order (no DB).
 * Run: npx tsx scripts/local-mm-funding-flow-check.ts
 */

import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { retailerDeskSupportsNetwork } from "../lib/server/retailer-funding-helpers"

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`)
}

function read(p: string): string {
  return readFileSync(resolve(process.cwd(), p), "utf8")
}

function main() {
  assert(
    retailerDeskSupportsNetwork([{ label: "MTN Mobile Money", value: "0771234567" }], "MTN"),
    "network matcher accepts MTN label",
  )
  assert(!retailerDeskSupportsNetwork([{ label: "Airtel", value: "075" }], "MTN"), "network matcher rejects mismatch")
  assert(retailerDeskSupportsNetwork([], "Other"), "Other skips strict network filter")

  const api = read("app/api/user/qualified-retailers/route.ts")
  assert(api.includes('searchParams.get("network")'), "API requires network query param")
  assert(api.includes("retailerDeskSupportsNetwork"), "API filters by desk payment_numbers vs network")

  const dash = read("app/dashboard/page.tsx")
  assert(dash.includes("localMmWizardStep"), "two-stage wizard state")
  assert(dash.includes("Step 1 of 2"), "qualification screen is step 1")
  assert(dash.includes("Step 2 of 2"), "retailer matching is step 2")
  assert(dash.includes("Continue · find retailers"), "single primary action after qualification fields")
  assert(dash.includes("Transaction reference (after you pay)"), "reference only after desk selection")
  assert(dash.includes("Available desks"), "retailer list on second screen")
  assert(dash.includes("No active retailer currently has enough liquidity"), "required empty state copy")
  assert(dash.includes("handleLoadQualifiedRetailers"), "load hook retained")
  assert(!dash.includes("<option value=\"\">Select qualified retailer…"), "premature retailer dropdown removed")

  console.log("local-mm-funding-flow-check: PASS")
}

main()
