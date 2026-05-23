/**
 * PASS/FAIL checks for operational visibility + financial UX phase (static verification).
 * Run: npx tsx scripts/acceptance-nexus-ux-phase.ts
 */

import { readFileSync } from "fs"
import { join } from "path"
import { estimateCopyForcePulloutUsd, estimateCopyAutoAdjustExitUsd } from "../lib/copy-trade-policy"
import { fixedTradeScheduleProjection } from "../lib/fixed-trade-projection"
import { formatMoneyAmount, localFiatUnitsToUsd } from "../lib/currency-display"

const root = process.cwd()

function has(path: string, needle: string) {
  const s = readFileSync(join(root, path), "utf8")
  return s.includes(needle)
}

let failed = 0
function check(name: string, ok: boolean) {
  if (!ok) {
    console.error(`FAIL: ${name}`)
    failed++
  } else {
    console.log(`PASS: ${name}`)
  }
}

check(
  "Operational HUD gated to level 5 in dashboard",
  has("app/dashboard/page.tsx", "(currentUser?.level ?? 1) === 5") &&
    has("app/dashboard/page.tsx", "OperationalContinuityHud")
)

check(
  "Pending withdrawal copy describes automated hold/release",
  has(
    "app/dashboard/page.tsx",
    "Funds deducted from your Nexus Main Account at withdrawal request"
  )
)

check("Copy policy exports fee helpers", estimateCopyForcePulloutUsd({ stakeUsd: 1000, floatingPnLUsd: 12 }).netToMainUsd > 0)

check(
  "Copy canonical 0.71% target rate exported",
  has("lib/copy-trade-policy.ts", "COPY_TRADE_TARGET_PROFIT_RATE") &&
    has("lib/copy-trade-policy.ts", "COPY_TRADE_TARGET_PROFIT_RATE") &&
    has("lib/container-earnings-schedule.ts", "CONTAINER_PERIOD_RETURN_MONTHLY_PCT_MIN")
)

check(
  "Fixed projection uses schedule engine",
  fixedTradeScheduleProjection(1000, 3, "test").totalTargetUsd > 0 &&
    estimateCopyAutoAdjustExitUsd(1000).netToMainUsd > 0
)

check(
  "Container mode wires copy-trade policy imports",
  has("components/dashboard/container-mode.tsx", "estimateCopyForcePulloutUsd") &&
    has("components/dashboard/container-mode.tsx", "fixedTradeScheduleProjection")
)

check(
  "Withdraw / funding converts preferred fiat input to USD before ledger",
  has("app/dashboard/page.tsx", "localFiatUnitsToUsd") && has("app/dashboard/page.tsx", "ledgerUsd")
)

{
  const usd = localFiatUnitsToUsd(20_000, "UGX")
  const back = formatMoneyAmount(usd, "UGX", "en")
  check(
    "UGX 20,000 input maps to ~USD 5.33 ledger and formats back to ~UGX 20k (no double FX)",
    Math.abs(usd - 5.333333) < 0.02 && back.replace(/\s/g, "").includes("20,000")
  )
}

process.exit(failed > 0 ? 1 : 0)
