#!/usr/bin/env npx tsx
/**
 * Audit: trading level ≠ retailer desk (Bony-style L2 traders must pass customer trading gate).
 * Run: npx tsx scripts/audit-platform-roles.ts
 */
import {
  blocksCustomerTradingApis,
  computeRetailerCreditSeller,
  resolvePlatformRouteRole,
} from "../lib/platform-roles"

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`)
}

function main() {
  const bonyId = "136764df-0213-4a75-b0fd-0dc8a7c110b6"
  const bonyEmail = "kamberebony@gmail.com"

  assert(
    resolvePlatformRouteRole({
      tradingUserLevel: 2,
      retailerCreditSellerFlag: false,
      userId: bonyId,
      email: bonyEmail,
    }) === "USER",
    "L2 Congo trader without retailer flag → USER route role",
  )
  assert(
    !blocksCustomerTradingApis(2, false),
    "L2 non-retailer must not block customer trading APIs",
  )

  assert(
    resolvePlatformRouteRole({
      tradingUserLevel: 2,
      retailerCreditSellerFlag: true,
      userId: "desk-id",
      email: "esk@example.com",
    }) === "RETAILER_DESK",
    "L2 + retailer_credit_seller → RETAILER_DESK",
  )
  assert(blocksCustomerTradingApis(2, true), "retailer desk blocks trading APIs")

  assert(
    resolvePlatformRouteRole({
      tradingUserLevel: 5,
      retailerCreditSellerFlag: false,
      userId: "admin-id",
      email: "admin@example.com",
    }) === "ADMIN_DESK",
    "L5 → ADMIN_DESK",
  )
  assert(blocksCustomerTradingApis(5, false), "L5 blocks customer trading")

  assert(
    !computeRetailerCreditSeller(bonyId, bonyEmail, false),
    "Bony must not be retailer from flag alone",
  )

  console.log("audit-platform-roles: PASS")
}

main()
