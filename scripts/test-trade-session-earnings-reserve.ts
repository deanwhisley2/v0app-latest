import {
  assertReserveConservation,
  buildReserveSchedule,
  computeMonthlyReserveAmounts,
  periodKeyFromDate,
  projectSessionPayoutUsd,
  resolveTradeSessionMonthlyTargetPct,
  scheduleSlotTotalUsd,
  settleTradeSessionParticipation,
  slotGrossUsdFromSchedule,
  TRADE_SESSION_PLATFORM_FEE_RATE,
} from "../lib/server/trade-session-earnings-reserve"
import { roundUsd2 } from "../lib/nexus-financial-policy"

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`)
}

function testMonthlyReserveExample() {
  const capital = 100
  const targetPct = 28
  const { grossMonthlyUsd, platformFeeUsd, netReserveUsd } = computeMonthlyReserveAmounts(
    capital,
    targetPct,
    TRADE_SESSION_PLATFORM_FEE_RATE,
  )
  assert(grossMonthlyUsd === 28, "gross $28")
  assert(platformFeeUsd === 0.84, "fee $0.84")
  assert(netReserveUsd === 27.16, "net $27.16")

  const schedule = buildReserveSchedule(netReserveUsd, "test-user|2026-06|100")
  assert(Math.abs(scheduleSlotTotalUsd(schedule) - netReserveUsd) < 0.02, "schedule sums to net reserve")
  console.log("✓ monthly reserve example ($100 → $27.16 net)")
}

function testConservationAfterEarnAndForfeit() {
  const net = 27.16
  const schedule = buildReserveSchedule(net, "conservation-test")
  let earned = 0
  let forfeited = 0
  let remaining = net

  const day0Morning = slotGrossUsdFromSchedule(schedule, 0, "morning")
  const payout = roundUsd2(day0Morning * 0.5)
  earned += payout
  remaining = roundUsd2(remaining - payout)

  const day0Evening = slotGrossUsdFromSchedule(schedule, 0, "evening")
  forfeited += day0Evening
  remaining = roundUsd2(remaining - day0Evening)

  assertReserveConservation(
    {
      net_reserve_usd: net,
      earned_usd: earned,
      forfeited_usd: forfeited,
      remaining_reserve_usd: remaining,
    },
    "test",
  )
  console.log("✓ earned + remaining + forfeited = net reserve")
}

function testProjectedPayoutUsesReserveNotStakeRate() {
  const userId = "00000000-0000-4000-8000-000000000099"
  const startAt = "2026-06-15T09:00:00.000Z"
  const payout = projectSessionPayoutUsd(
    {
      id: "r1",
      user_id: userId,
      period_key: periodKeyFromDate(new Date(startAt)),
      capital_usd: 100,
      monthly_target_pct: 28,
      gross_monthly_usd: 28,
      platform_fee_usd: 0.84,
      net_reserve_usd: 27.16,
      earned_usd: 0,
      forfeited_usd: 0,
      remaining_reserve_usd: 27.16,
      schedule: buildReserveSchedule(27.16, `reserve|${userId}|2026-06|100`),
      seed_key: "seed",
    },
    startAt,
    "morning",
    1,
  )
  assert(payout > 0 && payout < 5, "session payout is a reserve slice, not 2.5%+ of stake")
  console.log("✓ payout derived from reserve slot (not stake percentage hack)")
}

async function main() {
  testMonthlyReserveExample()
  testConservationAfterEarnAndForfeit()
  testProjectedPayoutUsesReserveNotStakeRate()
  console.log("test-trade-session-earnings-reserve: OK")
}

void main()
