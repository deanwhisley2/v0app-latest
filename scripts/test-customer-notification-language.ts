import assert from "node:assert/strict"
import {
  buildFundingApprovedCustomerCopy,
  sanitizeCustomerNotificationText,
} from "../lib/notifications/customer-notification-language"

const bad =
  "L5 approved admin direct admin_airtel_ug funding (MAIN_TREASURY debited). Normalized settlement: $13.33 USD."
const clean = sanitizeCustomerNotificationText(bad, "Your funding has been approved.")
assert.ok(!/MAIN_TREASURY|normalized settlement|admin_airtel/i.test(clean))

const approved = buildFundingApprovedCustomerCopy({
  amountInputLocal: 50_000,
  inputCurrency: "UGX",
  amountUsd: 13.33,
})
assert.match(approved.body, /UGX/)
assert.ok(!/normalized|treasury|MAIN_TREASURY/i.test(approved.body))
assert.match(approved.body, /approved and credited/)

console.log("customer-notification-language: PASS")
