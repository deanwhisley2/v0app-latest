import assert from "node:assert/strict"
import {
  fundingReferenceKind,
  isFundingReferenceFormatValid,
  normalizeFundingPaymentReference,
} from "../lib/server/funding-reference-normalize"

assert.equal(normalizeFundingPaymentReference("  AbC-123  "), "ABC123")
assert.equal(
  normalizeFundingPaymentReference("  Aa".repeat(32)),
  "aa".repeat(32),
)
const hash = "a".repeat(64)
assert.equal(normalizeFundingPaymentReference(`  ${hash.toUpperCase()}  `), hash)
assert.equal(fundingReferenceKind(hash), "crypto_tx")
assert.equal(fundingReferenceKind("ABC123"), "payment_ref")
assert.ok(isFundingReferenceFormatValid("ABC123"))
assert.ok(!isFundingReferenceFormatValid("AB"))

console.log("funding-reference-normalize: PASS")
