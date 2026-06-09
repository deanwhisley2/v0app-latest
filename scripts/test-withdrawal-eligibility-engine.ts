import assert from "node:assert/strict"
import {
  GLOBAL_CUSHION_THRESHOLD_USD,
  buildWithdrawalUiHint,
  hasGlobalAlternativeCushion,
  idleSecurityReserveDisplayLabel,
  idleSecurityReserveUsd,
} from "../lib/server/withdrawal-eligibility-engine"

assert.equal(idleSecurityReserveUsd("UG") > 0, true, "UG reserve converts to USD")
assert.equal(idleSecurityReserveUsd("KE"), 10, "non-UG reserve is $10")
assert.equal(idleSecurityReserveDisplayLabel("UG"), "UGX 20,000")
assert.equal(idleSecurityReserveDisplayLabel("KE"), "$10")

assert.equal(hasGlobalAlternativeCushion({ activeTradeStakeUsd: 10, pocketBalanceUsd: 0 }), true)
assert.equal(hasGlobalAlternativeCushion({ activeTradeStakeUsd: 0, pocketBalanceUsd: 10 }), true)
assert.equal(hasGlobalAlternativeCushion({ activeTradeStakeUsd: 9.99, pocketBalanceUsd: 9.99 }), false)
assert.equal(hasGlobalAlternativeCushion({ activeTradeStakeUsd: 751.53, pocketBalanceUsd: 0 }), true)

assert(
  buildWithdrawalUiHint({
    path: "active_trader",
    reserveDisplayLabel: "$10",
    activeTradeStakeUsd: 751,
  }).includes("Full Nexus Main"),
  "active path mentions full main",
)
assert(
  buildWithdrawalUiHint({ path: "idle_account", reserveDisplayLabel: "UGX 20,000" }).includes(
    "UGX 20,000",
  ),
  "idle hint mentions reserve",
)

assert.equal(GLOBAL_CUSHION_THRESHOLD_USD, 10)
console.log("withdrawal-eligibility-engine.test: OK")
