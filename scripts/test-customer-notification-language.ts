import assert from "node:assert/strict"
import {
  buildFundingApprovedCustomerCopy,
  sanitizeCustomerNotificationText,
} from "../lib/notifications/customer-notification-language"

const bad =
  "L5 approved admin direct admin_airtel_ug funding (MAIN_TREASURY debited). Normalized settlement: $13.33 USD."
const clean = sanitizeCustomerNotificationText(bad, "Your funding has been approved.")
assert.ok(!/MAIN_TREASURY|normalized settlement|admin_airtel/i.test(clean))

const approvedUg = buildFundingApprovedCustomerCopy({
  amountInputLocal: 50_000,
  inputCurrency: "UGX",
  amountUsd: 13.33,
  fundingCountryCode: "UG",
})
assert.match(approvedUg.body, /UGX/)

const approvedCd = buildFundingApprovedCustomerCopy({
  amountInputLocal: 2_000_000,
  inputCurrency: "UGX",
  amountUsd: 513.33,
  fundingCountryCode: "CD",
  preferredCurrency: "CDF",
  language: "fr",
  locale: "fr-CD",
})
assert.ok(!/UGX/i.test(approvedCd.body))
assert.match(approvedCd.body, /CDF|FC|\d/)
assert.ok(approvedCd.body.length < 80, "notification body stays short")
assert.ok(!/normalized|treasury|MAIN_TREASURY/i.test(approvedCd.body))
assert.match(approvedCd.body, /Credited/)

console.log("customer-notification-language: PASS")
