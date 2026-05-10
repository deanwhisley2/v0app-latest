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
  assert(dash.includes("1 · Payment network"), "UI step 1 is network")
  assert(dash.includes("2 · Your funding transaction"), "UI step 2 is transaction details before desks")
  assert(dash.includes("See eligible retailers"), "explicit retailer discovery after qualification")
  assert(dash.includes("3 · Choose a desk"), "desk selection after filter")
  assert(dash.includes("4 · Pay this desk"), "payment instructions after desk selection")
  assert(dash.includes("No active retailer currently has enough liquidity"), "required empty state copy")
  assert(dash.includes("handleLoadQualifiedRetailers"), "load hook retained")
  assert(!dash.includes("<option value=\"\">Select qualified retailer…"), "premature retailer dropdown removed")

  console.log("local-mm-funding-flow-check: PASS")
}

main()
