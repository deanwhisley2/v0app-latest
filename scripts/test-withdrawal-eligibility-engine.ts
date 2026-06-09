import assert from "node:assert/strict"
import {
  ACTIVE_TRADE_COLLATERAL_THRESHOLD_USD,
  buildWithdrawalUiHint,
  idleSecurityReserveDisplayLabel,
  idleSecurityReserveUsd,
} from "../lib/server/withdrawal-eligibility-engine"

assert.equal(idleSecurityReserveUsd("UG") > 0, true, "UG reserve converts to USD")
assert.equal(idleSecurityReserveUsd("KE"), 5, "non-UG reserve is $5")
assert.equal(idleSecurityReserveDisplayLabel("UG"), "UGX 20,000")
assert.equal(idleSecurityReserveDisplayLabel("KE"), "$5")

assert.equal(
  buildWithdrawalUiHint({ path: "active_trader", reserveDisplayLabel: "$5" }),
  "Available for withdrawal: Full balance (Active trade protection active).",
)
assert(
  buildWithdrawalUiHint({ path: "idle_account", reserveDisplayLabel: "UGX 20,000" }).includes(
    "UGX 20,000",
  ),
  "idle hint mentions reserve",
)

assert.equal(ACTIVE_TRADE_COLLATERAL_THRESHOLD_USD, 10)
console.log("withdrawal-eligibility-engine.test: OK")
