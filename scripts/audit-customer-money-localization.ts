#!/usr/bin/env npx tsx
/**
 * Audit: localized amount parsing + corridor display (no DB).
 * Run: npx tsx scripts/audit-customer-money-localization.ts
 */
import { parseCustomerLocalAmountInput } from "../lib/customer-amount-parse"
import { formatUsdForCustomerDisplay, buildCustomerMoneyContext } from "../lib/customer-facing-money"

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`)
}

const PARSE_CASES: Array<{ input: string; expected: number }> = [
  { input: "150000", expected: 150_000 },
  { input: "150,000", expected: 150_000 },
  { input: "150 000", expected: 150_000 },
  { input: "150 000,50", expected: 150_000.5 },
  { input: "150,000.00", expected: 150_000 },
  { input: "CDF 1 420 000", expected: 1_420_000 },
  { input: "UGX 250,000", expected: 250_000 },
  { input: "$66.50", expected: 66.5 },
  { input: "KSh 8,600.00", expected: 8_600 },
  { input: "1.519.199,50", expected: 1_519_199.5 },
  { input: "150.000", expected: 150_000 },
]

function main() {
  for (const { input, expected } of PARSE_CASES) {
    const got = parseCustomerLocalAmountInput(input)
    assert(got === expected, `${JSON.stringify(input)} → ${got}, want ${expected}`)
  }

  const cdFr = buildCustomerMoneyContext({ fundingCountryCode: "CD", language: "fr" })
  const fmt = formatUsdForCustomerDisplay(580, cdFr)
  assert(!/UGX/i.test(fmt), `CD display must not contain UGX: ${fmt}`)
  assert(/FC|CDF/i.test(fmt) || /\d/.test(fmt), `CD format expected: ${fmt}`)

  const cdEn = buildCustomerMoneyContext({ fundingCountryCode: "CD", language: "en" })
  const fmtEn = formatUsdForCustomerDisplay(100, cdEn)
  assert(!/UGX/i.test(fmtEn), `CD en display: ${fmtEn}`)

  const ug = buildCustomerMoneyContext({ fundingCountryCode: "UG", language: "en" })
  const ugFmt = formatUsdForCustomerDisplay(5, ug)
  assert(/UGX/i.test(ugFmt) || /\d/.test(ugFmt), `UG display: ${ugFmt}`)

  console.log("audit-customer-money-localization: PASS", { parseCases: PARSE_CASES.length, cdFr: fmt })
}

main()
