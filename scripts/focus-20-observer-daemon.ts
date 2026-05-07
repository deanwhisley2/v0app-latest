#!/usr/bin/env npx tsx
import { config } from "dotenv"
import { resolve } from "node:path"
import {
  acquireOrchestrationLease,
  getDaemonSymbolRuntime,
  heartbeatOrchestrationLease,
  updateDaemonSymbolRuntime,
} from "../lib/daemon-runtime-authority"
import { runObservationWindowTick } from "../lib/observation-window-tick"
import { buildFocusUniverse } from "../lib/behavior-market-intelligence"

config({ path: resolve(process.cwd(), ".env.local") })
config({ path: resolve(process.cwd(), ".env") })

const base = (process.env.FOCUS_OBSERVER_API_BASE || "http://localhost:3000").replace(/\/$/, "")
const intervalMs = Math.min(90_000, Math.max(30_000, Number(process.env.FOCUS_OBSERVER_INTERVAL_MS) || 60_000))
const analysisWindowSeconds = Math.min(
  180,
  Math.max(60, Number(process.env.FOCUS_OBSERVER_ANALYSIS_WINDOW_SECONDS) || 60)
)
const workerId = `focus_obs_${Math.random().toString(36).slice(2, 10)}`
const leaseKey = "focus-20-observer:global"

function log(tag: string, line: string) {
  console.log(`[${tag}] ${line}`)
}

async function resolveFocusSymbols(): Promise<string[]> {
  try {
    const res = await fetch(`${base}/api/joelin/oscillator`, { cache: "no-store", signal: AbortSignal.timeout(15_000) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = (await res.json()) as { focusDaily?: Array<{ symbol?: string }> }
    const fromFocus = (data.focusDaily ?? [])
      .map((x) => String(x.symbol ?? "").toUpperCase())
      .filter(Boolean)
    if (fromFocus.length >= 20) return fromFocus.slice(0, 20)
  } catch (e) {
    log("focus-universe", `fallback to static focus universe (${e instanceof Error ? e.message : String(e)})`)
  }
  return buildFocusUniverse(
    process.env.NEXUS_FOCUS_SYMBOLS?.split(",").map((s) => s.trim()).filter(Boolean),
    process.env.NEXUS_FOCUS_INCLUDE_GOLD === "1"
  ).slice(0, 20)
}

async function cycle(userId: string) {
  const lease = await acquireOrchestrationLease({
    leaseKey,
    workerId,
    ttlMs: Math.max(120_000, intervalMs * 3),
  })
  if (!lease.acquired) {
    log("focus-observer", `lease not acquired owner=${lease.ownerId}`)
    return
  }
  await heartbeatOrchestrationLease({
    leaseKey,
    workerId,
    ttlMs: Math.max(120_000, intervalMs * 3),
  })

  const symbols = await resolveFocusSymbols()
  log("focus-universe", `watching ${symbols.length} symbols: ${symbols.join(",")}`)

  const out = await runObservationWindowTick({
    userId,
    symbols,
    analysisWindowSeconds,
    governanceProbeQuoteUsd: Math.max(1, Number(process.env.FOCUS_OBSERVER_GOV_PROBE_USD) || 2),
    persistSandbox: process.env.FOCUS_OBSERVER_PERSIST_SANDBOX !== "0",
    includeStabilityRefresh: true,
  })

  for (const row of out.analyses) {
    const rt = await getDaemonSymbolRuntime({
      daemonType: "focus-20-observer",
      userId,
      symbol: row.symbol,
    })
    const sameAction = rt.streakAction === row.action
    await updateDaemonSymbolRuntime(
      {
        daemonType: "focus-20-observer",
        userId,
        symbol: row.symbol,
        expectedVersion: rt.version,
      },
      {
        streakAction: row.action,
        streakCount: sameAction ? rt.streakCount + 1 : 1,
        streakUpdatedAt: new Date().toISOString(),
        lastExecutionAt: new Date().toISOString(),
      }
    )
    log(
      "coin-behavior",
      `symbol=${row.symbol} action=${row.action} conf=${row.calibratedConfidence.toFixed(2)} streak=${sameAction ? rt.streakCount + 1 : 1}`
    )
  }

  log("signal-rhythm", `tickComplete analyses=${out.analyses.length} stabilityRefreshed=${out.stabilityRefreshed}`)
  log("behavior-learning", `sandboxTrades=${out.sandbox?.tradesAnalyzed ?? 0} reliability=${out.sandbox?.reliabilityScore ?? 0}`)
}

async function main() {
  const userId = process.env.NEXUS_EXPERT_FALLBACK_USER_ID?.trim()
  if (!userId) {
    console.error("[focus-observer] NEXUS_EXPERT_FALLBACK_USER_ID is required")
    process.exit(1)
  }
  log("focus-observer", `start intervalMs=${intervalMs} analysisWindowSec=${analysisWindowSeconds} worker=${workerId}`)
  while (true) {
    try {
      await cycle(userId)
    } catch (e) {
      log("focus-observer", `cycle failed: ${e instanceof Error ? e.message : String(e)}`)
    }
    await new Promise((r) => setTimeout(r, intervalMs))
  }
}

void main().catch((e) => {
  console.error(e)
  process.exit(1)
})
