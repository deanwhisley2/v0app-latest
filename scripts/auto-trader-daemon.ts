#!/usr/bin/env npx tsx
/**
 * Autonomous spot trading daemon (calls local Next.js APIs).
 *
 * Analysis alignment: default minimum observation window matches `/api/expert/analyze`
 * (300s). Set AUTO_TRADER_RELAX_TIME_WINDOW=1 for shorter windows (non-production only).
 *
 * Live orders require NEXUS_REAL_TRADING=1; sizing consults profiles.nexus_exchange_balances_snapshot
 * when present (written by the dashboard exchange poll). Nex UI execution uses
 * `/api/expert/execute/nex` + AnalysisHistory guards — prefer that path for full policy enforcement.
 *
 * Prerequisites:
 * - Next.js running (npm run dev or pm2 nexus) at AUTO_TRADER_API_BASE
 * - NEXUS_REAL_TRADING=1, BINANCE keys, NEXUS_REAL_TRADE_SECRET on server (.env.local)
 * - AUTO_TRADER_ENABLED=true
 *
 * Logs: logs/auto-trader.log (+ stdout)
 *
 * Grok + open-position “combat” mode:
 * - Default: AUTO_TRADER_FORCE_GROK unset → daemon sends signed forceGrok so chosen/Joelin symbols always get live Grok when the pipeline is live (header x-nexus-real-trade-secret). Set AUTO_TRADER_FORCE_GROK=0 to quota-limit only.
 * - AUTO_TRADER_POSITION_COMBAT unset or non-"0": while LONG, periodic fused analysis can exit early on strong SELL; at take-profit, may defer exit when fused+BUY is still bullish (capped). Set AUTO_TRADER_POSITION_COMBAT=0 to disable. Hard stop-loss and max-hold always apply — SL is never skipped.
 */
import * as fs from "node:fs"
import * as path from "node:path"
import { config } from "dotenv"
import {
  acquireOrchestrationLease,
  getDaemonSymbolRuntime,
  heartbeatOrchestrationLease,
  listDaemonSymbolLongs,
  updateDaemonSymbolRuntime,
} from "../lib/daemon-runtime-authority"
import { requestGovernanceApproval } from "../lib/global-execution-governor"
import { getResumeGate } from "../lib/startup-recovery"
import { loadExchangeBalancesSnapshot } from "../lib/server/load-exchange-balances-snapshot"
import { isGrokPipelineLive } from "../lib/grok-pipeline-status"
import { isSymbolEligibleForGrokQuota } from "../lib/grok-symbol-eligibility"

config({ path: path.resolve(process.cwd(), ".env.local") })
config({ path: path.resolve(process.cwd(), ".env") })

const LOG_DIR = path.resolve(process.cwd(), "logs")
const LOG_FILE = path.join(LOG_DIR, "auto-trader.log")

function log(line: string) {
  const stamp = new Date().toISOString()
  const msg = `[${stamp}] ${line}`
  console.log(msg)
  try {
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true })
    fs.appendFileSync(LOG_FILE, msg + "\n", "utf8")
  } catch {
    /* disk full / permissions */
  }
}

const base = (process.env.AUTO_TRADER_API_BASE || "http://localhost:3000").replace(/\/$/, "")
const secret = process.env.NEXUS_REAL_TRADE_SECRET?.trim() || ""
const symbols = (process.env.AUTO_TRADER_SYMBOLS || "BTC,ETH")
  .split(",")
  .map((s) => s.trim().toUpperCase().replace(/USDT$/i, ""))
  .filter(Boolean)

const ANALYSIS_MS = Math.max(60_000, Number(process.env.AUTO_TRADER_ANALYSIS_INTERVAL_MS) || 300_000)
const MONITOR_MS = Math.max(10_000, Number(process.env.AUTO_TRADER_MONITOR_INTERVAL_MS) || 30_000)
const RELAX_POLICY_WINDOW = process.env.AUTO_TRADER_RELAX_TIME_WINDOW === "1"
const MIN_ANALYSIS_WINDOW_SEC = RELAX_POLICY_WINDOW
  ? Math.max(60, Number(process.env.AUTO_TRADER_MIN_TIME_WINDOW_SECONDS) || 60)
  : Math.max(300, Number(process.env.AUTO_TRADER_MIN_TIME_WINDOW_SECONDS) || 300)
const TIME_WINDOW_SEC = Math.max(
  MIN_ANALYSIS_WINDOW_SEC,
  Number(process.env.AUTO_TRADER_TIME_WINDOW_SECONDS) || MIN_ANALYSIS_WINDOW_SEC
)
const POSITION_MAX_MS = Math.max(60_000, Number(process.env.AUTO_TRADER_POSITION_MAX_MS) || 7_200_000)

const POSITION_USD_MIN = Math.max(1, Number(process.env.AUTO_TRADER_POSITION_SIZE_USD) || 5)
const POSITION_USD_MAX = Math.max(
  POSITION_USD_MIN,
  Number(process.env.AUTO_TRADER_POSITION_SIZE_MAX_USD) || 10
)

const MAX_POSITIONS = Math.min(4, Math.max(1, Number(process.env.AUTO_TRADER_MAX_POSITIONS) || 2))
const MAX_EXPOSURE_USD = Math.max(POSITION_USD_MAX, Number(process.env.AUTO_TRADER_MAX_EXPOSURE_USD) || 20)
const DAILY_LOSS_LIMIT_USD = Number(process.env.AUTO_TRADER_DAILY_LOSS_LIMIT_USD) || 4
const SL_PCT = Number(process.env.AUTO_TRADER_STOP_LOSS_PERCENT) || 2
const TP_PCT = Number(process.env.AUTO_TRADER_TAKE_PROFIT_PERCENT) || 4
const CONF_MIN = Math.max(50, Number(process.env.AUTO_TRADER_CONFIDENCE_MIN) || 65)

/** Signed POST only — bypasses focus quota when unset or non-"0". Set AUTO_TRADER_FORCE_GROK=0 to save Grok credits on out-of-focus symbols. */
const FORCE_GROK_DAEMON = Boolean(secret) && process.env.AUTO_TRADER_FORCE_GROK !== "0"

/** Default on (unset): fused “combat” pulses while LONG + TP defer rules. Set AUTO_TRADER_POSITION_COMBAT=0 to disable. */
const POSITION_COMBAT = process.env.AUTO_TRADER_POSITION_COMBAT !== "0"

const COMBAT_WINDOW_SEC = Math.max(
  60,
  Math.min(600, Number(process.env.AUTO_TRADER_COMBAT_TIME_WINDOW_SECONDS) || Math.min(180, TIME_WINDOW_SEC))
)
const COMBAT_ANALYSIS_MS_RAW = Number(process.env.AUTO_TRADER_COMBAT_ANALYSIS_MS)
const COMBAT_ANALYSIS_MS =
  Number.isFinite(COMBAT_ANALYSIS_MS_RAW) && COMBAT_ANALYSIS_MS_RAW >= 60_000
    ? COMBAT_ANALYSIS_MS_RAW
    : Math.max(180_000, COMBAT_WINDOW_SEC * 1000 + 45_000)

const COMBAT_EXIT_CONF = Math.max(50, Number(process.env.AUTO_TRADER_COMBAT_EXIT_CONFIDENCE) || 72)
const COMBAT_HOLD_TP_CONF = Math.max(50, Number(process.env.AUTO_TRADER_COMBAT_HOLD_TP_CONFIDENCE) || 68)
const COMBAT_MAX_TP_DEFERS = Math.max(0, Math.min(30, Number(process.env.AUTO_TRADER_COMBAT_MAX_TP_DEFERS) || 5))

const workerId = `atd_${Math.random().toString(36).slice(2, 10)}`
let dynamicSymbols: string[] = [...symbols]

const lastCombatAnalysisAt = new Map<string, number>()
const tpDeferrals = new Map<string, number>()

function baseFromPair(pair: string): string {
  return pair.toUpperCase().replace(/USDT$/i, "").replace(/[^A-Z0-9]/g, "")
}

async function startupSafeToResume() {
  const gate = await getResumeGate()
  if (gate.status !== "SAFE_TO_RESUME") {
    log(
      `[resume-blocked] auto-trader gate=${gate.status} unresolved=${gate.unresolvedCount} reason=${gate.reason ?? "-"}`
    )
    return false
  }
  return true
}

function daemonUserId(): string | null {
  const v = process.env.NEXUS_EXPERT_FALLBACK_USER_ID?.trim()
  return v || null
}

async function runtimeForPair(pair: string, userId: string) {
  return getDaemonSymbolRuntime({ daemonType: "auto-trader-daemon", userId, symbol: pair })
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
    signal: AbortSignal.timeout(120_000),
  })
  const text = await res.text()
  let j: unknown
  try {
    j = JSON.parse(text) as T
  } catch {
    throw new Error(`Non-JSON ${res.status}: ${text.slice(0, 200)}`)
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 400)}`)
  return j as T
}

type OrderPayload = {
  status?: string
  fillQuantity?: number
  entryPrice?: number
  rejectionReason?: string
}

async function postTradeJson(
  url: string,
  body: Record<string, unknown>
): Promise<{ status: number; data: Record<string, unknown> }> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "x-nexus-real-trade-secret": secret,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  })
  const text = await res.text()
  let data: Record<string, unknown> = {}
  try {
    data = JSON.parse(text) as Record<string, unknown>
  } catch {
    data = { error: text.slice(0, 300), parseError: true }
  }
  return { status: res.status, data }
}

async function fetchSpotPrice(pair: string): Promise<number> {
  const u = new URL("https://api.binance.com/api/v3/ticker/price")
  u.searchParams.set("symbol", pair)
  const res = await fetch(u.toString(), { cache: "no-store", signal: AbortSignal.timeout(15_000) })
  if (!res.ok) throw new Error(`Binance price ${res.status}`)
  const j = (await res.json()) as { price?: string }
  const p = parseFloat(j.price ?? "0")
  if (!Number.isFinite(p) || p <= 0) throw new Error("Bad price")
  return p
}

async function runAnalysis(
  baseSymbol: string,
  opts?: { combat?: boolean }
): Promise<{ action: string; confidence: number } | null> {
  const windowSec = opts?.combat ? COMBAT_WINDOW_SEC : TIME_WINDOW_SEC
  const grokLive = isGrokPipelineLive()
  const includeGrok = grokLive && (FORCE_GROK_DAEMON || isSymbolEligibleForGrokQuota(baseSymbol))
  const forceGrok = FORCE_GROK_DAEMON && grokLive && includeGrok

  const url = `${base}/api/analysis/time-bound`
  const body: Record<string, unknown> = {
    symbol: baseSymbol,
    timeWindowSeconds: windowSec,
    includeGrok,
  }
  if (forceGrok) body.forceGrok = true

  const headers: Record<string, string> = {}
  if (forceGrok) headers["x-nexus-real-trade-secret"] = secret

  const data = await fetchJson<{ success?: boolean; result?: { fusedDecision?: { action: string; confidence: number } } }>(
    url,
    { method: "POST", body: JSON.stringify(body), headers }
  )
  if (!data.success || !data.result?.fusedDecision) {
    log(`Analysis failed or empty for ${baseSymbol}`)
    return null
  }
  return data.result.fusedDecision
}

async function refreshFocusSymbolsFromJoelin() {
  try {
    const data = await fetchJson<{
      focusDaily?: Array<{ symbol?: string }>
      analyzedProfitableCoins?: Array<{ symbol?: string }>
    }>(`${base}/api/joelin/oscillator`)
    const pool = [
      ...(data.analyzedProfitableCoins ?? []).map((x) => String(x.symbol ?? "")),
      ...(data.focusDaily ?? []).map((x) => String(x.symbol ?? "")),
    ]
      .map((s) => s.toUpperCase().replace(/USDT$/i, ""))
      .filter(Boolean)
    if (pool.length >= 3) {
      dynamicSymbols = Array.from(new Set(pool)).slice(0, 20)
    }
  } catch {
    dynamicSymbols = [...symbols]
  }
}

async function tradeExecute(
  payload: Record<string, unknown>
): Promise<{ ok: boolean; order?: OrderPayload; error?: string }> {
  if (!secret) throw new Error("NEXUS_REAL_TRADE_SECRET missing in env")
  const { status, data } = await postTradeJson(`${base}/api/trade/execute`, payload)
  const order = data.order as OrderPayload | undefined
  const ok = data.ok === true && order?.status === "FILLED"
  const errMsg =
    typeof data.error === "string"
      ? data.error
      : order?.rejectionReason
        ? String(order.rejectionReason)
        : status >= 400
          ? `HTTP ${status}`
          : undefined
  return { ok, order, error: ok ? undefined : errMsg ?? "execute not filled" }
}

async function tradeClose(body: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
  const { status, data } = await postTradeJson(`${base}/api/trade/close`, body)
  const ok = data.ok === true
  if (!ok) {
    const err =
      typeof data.error === "string"
        ? data.error
        : status >= 400
          ? `HTTP ${status}`
          : "close not ok"
    return { ok: false, error: err }
  }
  return { ok: true }
}

async function tradeStatus(): Promise<{ ok?: boolean; orders?: unknown[] }> {
  return fetchJson(`${base}/api/trade/status`, {
    method: "GET",
    headers: { "x-nexus-real-trade-secret": secret },
  })
}

function pickSpendUsd(): number {
  const span = POSITION_USD_MAX - POSITION_USD_MIN
  const v = POSITION_USD_MIN + Math.random() * (span || 1)
  return Math.round(v * 100) / 100
}

function levelsFor(side: "BUY" | "SELL", entry: number) {
  if (side === "BUY") {
    return {
      stopLoss: entry * (1 - SL_PCT / 100),
      takeProfit: entry * (1 + TP_PCT / 100),
    }
  }
  return {
    stopLoss: entry * (1 + SL_PCT / 100),
    takeProfit: entry * (1 - TP_PCT / 100),
  }
}

async function openLong(pair: string, spendUsd: number) {
  const userId = daemonUserId()
  if (!userId) throw new Error("NEXUS_EXPERT_FALLBACK_USER_ID missing")
  const gov = await requestGovernanceApproval({
    workerId,
    lane: "auto-trader-daemon",
    userId,
    symbol: pair,
    action: "BUY",
    requestedQuoteUsd: spendUsd,
  })
  if (!gov.approved) {
    log(`[worker-governance] BUY denied symbol=${pair} status=${gov.status} reason=${gov.reason ?? "-"}`)
    return
  }
  const ref = await fetchSpotPrice(pair)
  const { stopLoss, takeProfit } = levelsFor("BUY", ref)
  log(`OPEN LONG ${pair} spend≈$${spendUsd} ref≈${ref} SL=${stopLoss.toFixed(4)} TP=${takeProfit.toFixed(4)}`)
  const res = await tradeExecute({
    symbol: pair,
    action: "BUY",
    stopLoss,
    takeProfit,
    quoteSpendUsd: spendUsd,
    riskPercent: 2,
  })
  if (!res.ok || res.order?.status !== "FILLED") {
    log(`OPEN FAILED ${pair}: ${res.error ?? JSON.stringify(res.order ?? res)}`)
    return
  }
  const qty = Number(res.order?.fillQuantity ?? 0)
  const entry = Number(res.order?.entryPrice ?? ref) || ref
  const lv = levelsFor("BUY", entry)
  if (!Number.isFinite(qty) || qty <= 0) {
    log(`OPEN ${pair}: bad fill qty, not tracking`)
    return
  }
  const rt = await runtimeForPair(pair, userId)
  await updateDaemonSymbolRuntime(
    { daemonType: "auto-trader-daemon", userId, symbol: pair, expectedVersion: rt.version },
    {
      positionStatus: "LONG",
      openQuantity: qty,
      openEntryPrice: entry,
      openEntryCost: spendUsd,
      lastEntryAt: new Date().toISOString(),
      lastExecutionAt: new Date().toISOString(),
    }
  )
  log(`[execution-authority] symbol=${pair} worker=${workerId} position=LONG`)
  log(`OPEN OK ${pair} qty=${qty} entry≈${entry.toFixed(4)} SL=${lv.stopLoss.toFixed(4)} TP=${lv.takeProfit.toFixed(4)}`)
}

async function closeLong(pair: string, reason: string) {
  const userId = daemonUserId()
  if (!userId) return
  const gov = await requestGovernanceApproval({
    workerId,
    lane: "auto-trader-daemon",
    userId,
    symbol: pair,
    action: "SELL",
  })
  if (!gov.approved) {
    log(`[worker-governance] SELL denied symbol=${pair} status=${gov.status} reason=${gov.reason ?? "-"}`)
    return
  }
  const p = await runtimeForPair(pair, userId)
  if (p.positionStatus !== "LONG" || !p.openQuantity || !p.openEntryPrice) return
  const px = await fetchSpotPrice(pair)
  const estPnl = (px - p.openEntryPrice) * p.openQuantity
  log(`CLOSE ${pair} reason=${reason} qty=${p.openQuantity} estPnl≈$${estPnl.toFixed(4)}`)
  try {
    const res = await tradeClose({ symbol: pair, baseQuantity: p.openQuantity })
    if (!res.ok) {
      log(`CLOSE FAILED ${pair}: ${res.error ?? "unknown"} — will retry`)
      return
    }
    log(`CLOSE OK ${pair}`)
  } catch (e) {
    log(`CLOSE ERROR ${pair}: ${e instanceof Error ? e.message : String(e)} — will retry`)
    return
  }
  const lossWindow = estPnl < 0 ? p.totalLossWindow + Math.abs(estPnl) : p.totalLossWindow
  await updateDaemonSymbolRuntime(
    { daemonType: "auto-trader-daemon", userId, symbol: pair, expectedVersion: p.version },
    {
      positionStatus: "FLAT",
      openQuantity: null,
      openEntryPrice: null,
      openEntryCost: null,
      lastEntryAt: null,
      lastExecutionAt: new Date().toISOString(),
      tradeCountWindow: p.tradeCountWindow + 1,
      totalLossWindow: lossWindow,
      windowStart: p.windowStart ?? new Date().toISOString(),
    }
  )
  lastCombatAnalysisAt.delete(pair)
  tpDeferrals.delete(pair)
  log(`[risk-window] symbol=${pair} trades=${p.tradeCountWindow + 1} lossWindow=$${lossWindow.toFixed(4)}`)
}

async function monitorPositions() {
  if (!(await startupSafeToResume())) return
  const userId = daemonUserId()
  if (!userId) return

  let longPairs: string[] = []
  try {
    longPairs = await listDaemonSymbolLongs({ daemonType: "auto-trader-daemon", userId })
  } catch (e) {
    log(`[monitor] list LONG positions failed: ${e instanceof Error ? e.message : String(e)}`)
  }

  const basesFromDb = longPairs.map((pairKey) => baseFromPair(pairKey)).filter(Boolean)
  const basesToScan = Array.from(new Set([...symbols, ...dynamicSymbols, ...basesFromDb]))

  for (const sym of basesToScan) {
    const pair = `${sym}USDT`
    const p = await runtimeForPair(pair, userId)
    if (p.positionStatus !== "LONG" || !p.lastEntryAt || !p.openEntryPrice) continue
    const age = Date.now() - new Date(p.lastEntryAt).getTime()
    let price: number
    try {
      price = await fetchSpotPrice(pair)
    } catch {
      continue
    }

    const tpThreshold = p.openEntryPrice * (1 + TP_PCT / 100)
    if (price < tpThreshold * 0.997) {
      tpDeferrals.delete(pair)
    }

    if (age >= POSITION_MAX_MS) {
      await closeLong(pair, "max_hold_time")
      continue
    }
    if (price <= p.openEntryPrice * (1 - SL_PCT / 100)) {
      await closeLong(pair, "stop_loss")
      continue
    }

    if (POSITION_COMBAT) {
      const lastCombat = lastCombatAnalysisAt.get(pair) ?? 0
      if (Date.now() - lastCombat >= COMBAT_ANALYSIS_MS) {
        lastCombatAnalysisAt.set(pair, Date.now())
        try {
          const fused = await runAnalysis(sym, { combat: true })
          if (fused && fused.action === "SELL" && fused.confidence >= COMBAT_EXIT_CONF) {
            await closeLong(pair, "combat_signal_exit")
            continue
          }
          if (fused) {
            log(
              `[combat] ${pair} pulse fused=${fused.action} conf=${fused.confidence}% (exit≥${COMBAT_EXIT_CONF} tpHold≥${COMBAT_HOLD_TP_CONF})`
            )
          }
        } catch (e) {
          log(`[combat] ${pair} pulse error: ${e instanceof Error ? e.message : String(e)}`)
        }
      }
    }

    if (price >= tpThreshold) {
      if (
        POSITION_COMBAT &&
        (tpDeferrals.get(pair) ?? 0) < COMBAT_MAX_TP_DEFERS
      ) {
        try {
          const fused = await runAnalysis(sym, { combat: true })
          if (fused && fused.action === "BUY" && fused.confidence >= COMBAT_HOLD_TP_CONF) {
            const n = (tpDeferrals.get(pair) ?? 0) + 1
            tpDeferrals.set(pair, n)
            log(`[combat] ${pair} TP deferred (${n}/${COMBAT_MAX_TP_DEFERS}) fused=BUY conf=${fused.confidence}%`)
            continue
          }
        } catch (e) {
          log(`[combat] ${pair} TP defer error: ${e instanceof Error ? e.message : String(e)}`)
        }
      }
      await closeLong(pair, "take_profit")
      continue
    }
  }
  try {
    const st = await tradeStatus()
    if (st.orders?.length) log(`[status] openOrders count=${st.orders.length}`)
  } catch {
    /* optional */
  }
}

async function analysisCycle() {
  if (!(await startupSafeToResume())) return
  const userId = daemonUserId()
  if (!userId) {
    log("NEXUS_EXPERT_FALLBACK_USER_ID missing")
    return
  }
  const lease = await acquireOrchestrationLease({
    leaseKey: "auto-trader-daemon:global",
    workerId,
    ttlMs: Math.max(120_000, ANALYSIS_MS * 2),
  })
  if (!lease.acquired) {
    log(`[worker-takeover] leaseOwner=${lease.ownerId}`)
    return
  }
  await heartbeatOrchestrationLease({
    leaseKey: "auto-trader-daemon:global",
    workerId,
    ttlMs: Math.max(120_000, ANALYSIS_MS * 2),
  })

  if (process.env.AUTO_TRADER_ENABLED !== "true") {
    log("AUTO_TRADER_ENABLED is not true — idle")
    return
  }

  let openCount = 0
  let exposure = 0
  let totalLossWindow = 0
  for (const sym of dynamicSymbols) {
    const pair = `${sym}USDT`
    const rt = await runtimeForPair(pair, userId)
    if (rt.positionStatus === "LONG") {
      openCount += 1
      exposure += rt.openEntryCost ?? 0
    }
    totalLossWindow += rt.totalLossWindow
  }
  if (totalLossWindow >= DAILY_LOSS_LIMIT_USD) {
    log(`loss window reached $${totalLossWindow.toFixed(2)} (limit $${DAILY_LOSS_LIMIT_USD})`)
    return
  }

  const balSnap = await loadExchangeBalancesSnapshot(userId)
  let availFromProfile: number | null = null
  if (balSnap && Number.isFinite(balSnap.totalUsd)) {
    availFromProfile = Math.max(0, balSnap.totalUsd - exposure)
    log(
      `[balances-profile] totalUsd≈$${balSnap.totalUsd.toFixed(2)} avail≈$${availFromProfile.toFixed(2)} updatedAt=${balSnap.updatedAt}`
    )
  } else {
    log("[balances-profile] no snapshot — sync USD totals by opening the dashboard with exchanges connected")
  }

  await refreshFocusSymbolsFromJoelin()
  for (const sym of dynamicSymbols) {
    const pair = `${sym}USDT`
    let fused: { action: string; confidence: number } | null = null
    try {
      fused = await runAnalysis(sym)
    } catch (e) {
      log(`Analysis error ${sym}: ${e instanceof Error ? e.message : String(e)}`)
      continue
    }
    if (!fused) continue
    const { action, confidence } = fused
    log(`${pair} signal=${action} conf=${confidence}% (min ${CONF_MIN})`)

    if (confidence <= CONF_MIN || action === "HOLD") continue

    const runtime = await runtimeForPair(pair, userId)
    const hasLong = runtime.positionStatus === "LONG"

    if (action === "SELL") {
      if (hasLong) await closeLong(pair, "signal_sell_exit")
      else log(`${pair} SELL signal — no long to close (spot)`)
      continue
    }

    if (action === "BUY") {
      if (hasLong) {
        log(`${pair} BUY skipped — already long`)
        continue
      }
      if (openCount >= MAX_POSITIONS) {
        log(`BUY skipped — max positions ${MAX_POSITIONS}`)
        continue
      }
      let spend = pickSpendUsd()
      if (availFromProfile !== null) {
        spend = Math.min(spend, availFromProfile * 0.98)
      }
      if (availFromProfile !== null && spend < POSITION_USD_MIN) {
        log(`BUY skipped ${pair} — profile available USD≈$${availFromProfile.toFixed(2)} (below min position)`)
        continue
      }
      if (exposure + spend > MAX_EXPOSURE_USD) {
        log(`BUY skipped — would exceed exposure $${MAX_EXPOSURE_USD}`)
        continue
      }
      try {
        await openLong(pair, spend)
        openCount += 1
        exposure += spend
      } catch (e) {
        log(`OPEN exception ${pair}: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
  }
}

function main() {
  if (!secret) {
    console.error("Set NEXUS_REAL_TRADE_SECRET in .env.local (same as Next server)")
    process.exit(1)
  }
  if (process.env.AUTO_TRADER_ENABLED !== "true") {
    log("WARN: AUTO_TRADER_ENABLED is not true — no new entries; monitoring still runs for tracked positions")
  }

  log("=== nexus-auto-trader daemon start ===")
  log(`API_BASE=${base} symbols=${symbols.join(",")} analysisEvery=${ANALYSIS_MS}ms monitorEvery=${MONITOR_MS}ms`)
  log(`timeWindowSec=${TIME_WINDOW_SEC} (min ${MIN_ANALYSIS_WINDOW_SEC}${RELAX_POLICY_WINDOW ? " RELAX" : " policy"})`)
  log(`positionUsd=${POSITION_USD_MIN}-${POSITION_USD_MAX} maxPos=${MAX_POSITIONS} maxExposure=$${MAX_EXPOSURE_USD}`)
  log(
    `grokDaemonForce=${FORCE_GROK_DAEMON} positionCombat=${POSITION_COMBAT} combatEvery=${COMBAT_ANALYSIS_MS}ms combatWindowSec=${COMBAT_WINDOW_SEC}`
  )

  void analysisCycle()
  const t1 = setInterval(() => void analysisCycle(), ANALYSIS_MS)
  const t2 = setInterval(() => void monitorPositions(), MONITOR_MS)

  const shutdown = () => {
    clearInterval(t1)
    clearInterval(t2)
    log("Daemon shutdown")
    process.exit(0)
  }
  process.on("SIGINT", shutdown)
  process.on("SIGTERM", shutdown)
}

main()
