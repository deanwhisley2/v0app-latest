/**
 * Nexus Time-Weighted Yield Engine v2 stress test.
 *   npx tsx scripts/stress-test-yield-engine.ts
 */

import { calculateTimeWeightedYield } from "../lib/server/time-weighted-yield-engine"

function runStressTest() {
  console.log("=== NEXUS YIELD ENGINE v2 STRESS TEST ===\n")

  const sessionStart = new Date("2026-06-08T09:00:00Z")
  const sessionEnd = new Date("2026-06-08T17:00:00Z")
  const maxYieldPercent = 0.6

  console.log("Test A: 1,000 users joining randomly across 8-hour session...")
  const users = []
  for (let i = 0; i < 1000; i++) {
    const randomOffsetHours = Math.random() * 12
    const joinTime = new Date(sessionStart.getTime() + randomOffsetHours * 3_600_000)
    users.push(
      calculateTimeWeightedYield({
        sessionId: "stress_test",
        userId: `user_${i}`,
        capitalAtJoinUsd: 100 + Math.random() * 900,
        joinTime,
        sessionStart,
        sessionEnd,
        maxYieldPercent,
      }),
    )
  }

  const active = users.filter((u) => !u.rejected)
  const earlyBirds = active.filter((u) => u.isEarlyBird).length
  const lateEntrants = active.filter((u) => !u.isEarlyBird).length
  const rejected = users.filter((u) => u.rejected).length
  const totalProfit = active.reduce((sum, u) => sum + u.profitUsd, 0)
  const avgEarned =
    active.reduce((sum, u) => sum + u.earnedPercent, 0) / Math.max(1, active.length)
  const earlyAvg =
    active.filter((u) => u.isEarlyBird).reduce((s, u) => s + u.earnedPercent, 0) /
    Math.max(1, earlyBirds)
  const lateAvg =
    active.filter((u) => !u.isEarlyBird).reduce((s, u) => s + u.earnedPercent, 0) /
    Math.max(1, lateEntrants)

  console.log(`  Early birds: ${earlyBirds}`)
  console.log(`  Late entrants: ${lateEntrants}`)
  console.log(`  Rejected (after end): ${rejected}`)
  console.log(`  Total profit distributed: $${totalProfit.toFixed(2)}`)
  console.log(`  Average earned %: ${avgEarned.toFixed(4)}%`)
  console.log(
    `  Fairness (early avg > late avg): ${earlyBirds > 0 && lateEntrants > 0 && earlyAvg > lateAvg ? "PASS" : "CHECK"}\n`,
  )

  console.log("Test B: Determinism — same inputs, same outputs...")
  const fixedInput = {
    sessionId: "determinism_test",
    userId: "fixed_user",
    capitalAtJoinUsd: 1000,
    joinTime: new Date("2026-06-08T11:00:00Z"),
    sessionStart,
    sessionEnd,
    maxYieldPercent,
  }
  const r1 = calculateTimeWeightedYield(fixedInput)
  const r2 = calculateTimeWeightedYield(fixedInput)
  const r3 = calculateTimeWeightedYield(fixedInput)
  const deterministic =
    r1.earnedPercent === r2.earnedPercent &&
    r2.earnedPercent === r3.earnedPercent &&
    r1.profitUsd === r2.profitUsd &&
    r2.profitUsd === r3.profitUsd
  console.log(`  Deterministic: ${deterministic ? "PASS" : "FAIL"}`)
  console.log(`  Fixed output: ${r1.earnedPercent}% → $${r1.profitUsd}\n`)

  console.log("Test C: Edge cases...")
  const edges = [
    { name: "Join exactly at start", joinTime: new Date("2026-06-08T09:00:00Z") },
    { name: "Join 1ms after start", joinTime: new Date("2026-06-08T09:00:00.001Z") },
    { name: "Join exactly at end", joinTime: new Date("2026-06-08T17:00:00Z") },
    { name: "Join 1ms after end", joinTime: new Date("2026-06-08T17:00:00.001Z") },
  ]
  for (const edge of edges) {
    const result = calculateTimeWeightedYield({ ...fixedInput, joinTime: edge.joinTime })
    console.log(
      `  ${edge.name}: ${result.earnedPercent}% → ${result.rejected ? "REJECTED" : `$${result.profitUsd}`}`,
    )
  }

  console.log("\n=== STRESS TEST COMPLETE ===")
  if (!deterministic) process.exit(1)
}

runStressTest()
