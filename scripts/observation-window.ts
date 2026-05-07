#!/usr/bin/env npx tsx
/**
 * Observational learning daemon — until OBSERVATION_UNTIL (default: +24h from start).
 *
 * - Real feeds: time-bound analysis, live market structure, governance approval probe (no orders).
 * - Shadow: sandbox replay persisted to SimulationRun (TradeMemory replay — needs historical rows).
 * - Stability: optional intermittent refresh.
 *
 * NOT live execution — never calls /api/expert/execute/*.
 *
 * Env:
 *   NEXUS_EXPERT_FALLBACK_USER_ID (required)
 *   OBSERVATION_SYMBOLS=BTCUSDT,ETHUSDT (default BTCUSDT)
 *   OBSERVATION_INTERVAL_MS=180000 (default 3 min)
 *   OBSERVATION_ANALYSIS_WINDOW_SECONDS=60 (default)
 *   OBSERVATION_GOVERNANCE_PROBE_USD=5 (minimal BUY probe for governor logging)
 *   OBSERVATION_UNTIL=ISO8601 (optional — default now+24h)
 *   OBSERVATION_SKIP_STABILITY=0 — set 1 to skip stability-intelligence refresh each cycle
 *
 * Run: npx tsx scripts/observation-window.ts
 */
import { config } from "dotenv"
import { resolve } from "node:path"
import { runObservationWindowTick } from "../lib/observation-window-tick"
import { buildFocusUniverse } from "../lib/behavior-market-intelligence"

config({ path: resolve(process.cwd(), ".env.local") })
config({ path: resolve(process.cwd(), ".env") })

function parseSymbols(raw: string | undefined): string[] {
  const parsed = (raw?.trim() || "")
    .split(",")
    .map((x) => x.trim().toUpperCase())
    .filter(Boolean)
  const includeGold = process.env.OBSERVATION_INCLUDE_GOLD === "1"
  return buildFocusUniverse(parsed.length > 0 ? parsed : undefined, includeGold)
}

async function main() {
  const userId = process.env.NEXUS_EXPERT_FALLBACK_USER_ID?.trim()
  if (!userId) {
    console.error("[observation-window] NEXUS_EXPERT_FALLBACK_USER_ID is required")
    process.exit(1)
  }

  const intervalMs = Math.max(60_000, Number(process.env.OBSERVATION_INTERVAL_MS) || 180_000)
  const analysisWindowSeconds = Math.min(600, Math.max(60, Number(process.env.OBSERVATION_ANALYSIS_WINDOW_SECONDS) || 60))
  const probeUsd = Math.max(1, Number(process.env.OBSERVATION_GOVERNANCE_PROBE_USD) || 5)
  const symbols = parseSymbols(process.env.OBSERVATION_SYMBOLS)
  const skipStability = process.env.OBSERVATION_SKIP_STABILITY === "1"

  let endMs: number
  if (process.env.OBSERVATION_UNTIL?.trim()) {
    endMs = new Date(process.env.OBSERVATION_UNTIL).getTime()
    if (!Number.isFinite(endMs)) {
      console.error("[observation-window] invalid OBSERVATION_UNTIL")
      process.exit(1)
    }
  } else {
    endMs = Date.now() + 24 * 60 * 60_000
  }

  let tick = 0
  console.log(
    `[observation-window] start userId=${userId} symbols=${symbols.join(",")} intervalMs=${intervalMs} until=${new Date(endMs).toISOString()} analysisWindowSec=${analysisWindowSeconds}`,
  )

  while (Date.now() < endMs) {
    tick += 1
    try {
      const includeStability = !skipStability && tick % 4 === 0
      await runObservationWindowTick({
        userId,
        symbols,
        analysisWindowSeconds,
        governanceProbeQuoteUsd: probeUsd,
        persistSandbox: true,
        includeStabilityRefresh: includeStability,
      })
    } catch (e) {
      console.error(
        `[observation-window] tick ${tick} failed: ${e instanceof Error ? e.message : String(e)}`,
      )
    }
    const sleep = Math.min(intervalMs, Math.max(0, endMs - Date.now()))
    if (sleep <= 0) break
    await new Promise((r) => setTimeout(r, sleep))
  }

  console.log(`[observation-window] end tickCount=${tick} — window closed`)
}

void main().catch((e) => {
  console.error(e)
  process.exit(1)
})
