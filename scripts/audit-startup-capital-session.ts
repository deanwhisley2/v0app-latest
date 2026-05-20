#!/usr/bin/env npx tsx
/**
 * Audit: startup capital milestone slot rules + launch config (no DB).
 * Run: npx tsx scripts/audit-startup-capital-session.ts
 */
import {
  DEFAULT_GLOBAL_LAUNCH_PROGRAMS,
  STARTUP_CAPITAL_REGISTRATIONS_REQUIRED,
  STARTUP_CAPITAL_USD_REWARD,
} from "../lib/platform-launch-config"
import {
  getStartupCapitalRegistrationsRequired,
  getStartupCapitalUsdReward,
  startupCapitalActive,
} from "../lib/server/platform-launch"
import { isReferralMilestoneSlot } from "../lib/server/startup-capital-session"

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`)
}

function main() {
  assert(
    DEFAULT_GLOBAL_LAUNCH_PROGRAMS.startup_capital?.enabled === true,
    "global launch must enable startup_capital",
  )
  assert(
    DEFAULT_GLOBAL_LAUNCH_PROGRAMS.startup_capital?.usd_reward === STARTUP_CAPITAL_USD_REWARD,
    "usd_reward default",
  )
  assert(
    DEFAULT_GLOBAL_LAUNCH_PROGRAMS.startup_capital?.registrations_required ===
      STARTUP_CAPITAL_REGISTRATIONS_REQUIRED,
    "registrations_required default",
  )

  const programs = DEFAULT_GLOBAL_LAUNCH_PROGRAMS
  assert(
    getStartupCapitalUsdReward(programs) === 6,
    "getStartupCapitalUsdReward",
  )
  assert(
    getStartupCapitalRegistrationsRequired(programs) === 10,
    "getStartupCapitalRegistrationsRequired",
  )

  assert(isReferralMilestoneSlot(1), "slot 1 milestone")
  assert(isReferralMilestoneSlot(10), "slot 10 milestone")
  assert(!isReferralMilestoneSlot(11), "slot 11 not milestone")
  assert(!isReferralMilestoneSlot(null), "null not milestone")

  const activeStatus = {
    active: true,
    slug: "global-referral-2026",
    title: "Test",
    regionCode: "GLOBAL",
    activatedAt: new Date().toISOString(),
    endsAt: new Date(Date.now() + 86400000).toISOString(),
    daysRemaining: 1,
    hoursRemaining: 24,
    programs: DEFAULT_GLOBAL_LAUNCH_PROGRAMS,
    launchMode: true,
  }
  assert(startupCapitalActive(activeStatus), "startupCapitalActive when launch on")
  assert(
    !startupCapitalActive({ ...activeStatus, active: false }),
    "startupCapitalActive false when inactive",
  )

  console.log("audit-startup-capital-session: PASS")
}

main()
