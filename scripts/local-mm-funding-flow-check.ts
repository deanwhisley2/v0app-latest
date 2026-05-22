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

  assert(
    !retailerDeskSupportsNetwork([{ label: "primary", value: "0770001001" }], "MTN"),
    "without country hint generic labels do not infer MTN",
  )
  assert(
    retailerDeskSupportsNetwork(
      [{ label: "MTN Mobile Money Uganda", value: "+256794152339", payment_type: "mtn_mobile_ug" }],
      "MTN",
      "UG",
    ),
    "UG: ESK MTN line matches MTN selection",
  )
  assert(
    retailerDeskSupportsNetwork([{ label: "primary", value: "0750001002" }], "Airtel", "UG"),
    "UG: generic label + 075… matches Airtel via prefix",
  )
  assert(
    !retailerDeskSupportsNetwork([{ label: "primary", value: "0750001002" }], "MTN", "UG"),
    "UG: Airtel MSISDN must not match MTN selection",
  )
  assert(
    retailerDeskSupportsNetwork(
      [
        { label: "M-Pesa Kenya", value: "0117071995", payment_type: "mpesa_mobile_ke" },
        { label: "M-Pesa Kenya", value: "0115831794", payment_type: "mpesa_mobile_ke" },
      ],
      "MPesa",
      "KE",
    ),
    "KE: ESK M-Pesa lines match MPesa selection",
  )
  assert(
    !retailerDeskSupportsNetwork(
      [{ label: "M-Pesa Kenya", value: "0117071995", payment_type: "mpesa_mobile_ke" }],
      "MPesa",
      "UG",
    ),
    "KE: M-Pesa lines must not match Uganda corridor",
  )

  const api = read("app/api/user/qualified-retailers/route.ts")
  assert(api.includes('searchParams.get("network")'), "API requires network query param")
  assert(api.includes("collectQualifiedRetailDesks"), "API uses shared solvency-first qualification")
  assert(
    read("lib/server/retailer-qualification.ts").includes("loadActiveCorridorDesksForProfiles"),
    "qualification merges per-country corridor desks",
  )
  assert(
    read("lib/server/retailer-qualification.ts").includes("applyPaymentRotationToDeskRow"),
    "qualification exposes one rotated payment line",
  )
  assert(api.includes("official_fallback"), "API can return official company corridor when no desk qualifies")

  const dash = read("app/dashboard/page.tsx")
  assert(dash.includes("localMmWizardStep"), "two-stage wizard state")
  assert(dash.includes("funding.local.step1Title"), "qualification screen is step 1")
  assert(dash.includes("funding.local.step2Title"), "retailer matching is step 2")
  assert(dash.includes("funding.continueFindRetailers"), "primary action after qualification fields")
  assert(dash.includes("PaymentReferenceFields"), "transaction reference field present after desk selection")
  assert(dash.includes("funding.qualifiedDesksTitle"), "retailer list on second screen")
  assert(dash.includes("funding.noDeskCorridorTitle"), "empty-state when no desk and no official corridor")
  assert(dash.includes("parseKeMpesaMobileDesk"), "Kenya M-Pesa desk parsing wired")
  assert(dash.includes("handleLoadQualifiedRetailers"), "load hook retained")
  assert(!dash.includes("<option value=\"\">Select qualified retailer…"), "premature retailer dropdown removed")

  console.log("local-mm-funding-flow-check: PASS")
}

main()
