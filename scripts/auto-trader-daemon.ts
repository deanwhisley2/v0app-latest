#!/usr/bin/env npx tsx
/**
 * Autonomous spot trading daemon (calls local Next.js APIs).
 *
 * Prerequisites:
 * - Next.js running (npm run dev or pm2 nexus) at AUTO_TRADER_API_BASE
 * - NEXUS_REAL_TRADING=1, BINANCE keys, NEXUS_REAL_TRADE_SECRET on server (.env.local)
 * - AUTO_TRADER_ENABLED=true
 *
 * Logs: logs/auto-trader.log (+ stdout)
 */
import * as fs from "node:fs"
import * as path from "node:path"
import { config } from "dotenv"

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
const TIME_WINDOW_SEC = Math.max(60, Number(process.env.AUTO_TRADER_TIME_WINDOW_SECONDS) || 120)
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
const CONSEC_LOSS_PAUSE_MS = 60 * 60 * 1000

type Side = "long"

type OpenPosition = {
  pair: string
  side: Side
  entry: number
  quantity: number
  stopLoss: number
  takeProfit: number
  openedAt: number
  quoteSpentUsd: number
}

const state = {
  open: new Map<string, OpenPosition>(),
  dailyKey: new Date().toISOString().slice(0, 10),
  realizedPnlUsd: 0,
  consecutiveLosses: 0,
  pausedUntil: 0,
}

function rollDay() {
  const k = new Date().toISOString().slice(0, 10)
  if (k !== state.dailyKey) {
    state.dailyKey = k
    state.realizedPnlUsd = 0
    log(`Daily stats reset (${k})`)
  }
}

function isPaused(): boolean {
  return Date.now() < state.pausedUntil
}

function totalExposureUsd(): number {
  let s = 0
  for (const p of state.open.values()) s += p.quoteSpentUsd
  return s
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

async function runAnalysis(baseSymbol: string): Promise<{ action: string; confidence: number } | null> {
  const url = `${base}/api/analysis/time-bound`
  const body = {
    symbol: baseSymbol,
    timeWindowSeconds: TIME_WINDOW_SEC,
    includeGrok: false,
  }
  const data = await fetchJson<{ success?: boolean; result?: { fusedDecision?: { action: string; confidence: number } } }>(
    url,
    { method: "POST", body: JSON.stringify(body) }
  )
  if (!data.success || !data.result?.fusedDecision) {
    log(`Analysis failed or empty for ${baseSymbol}`)
    return null
  }
  return data.result.fusedDecision
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
  state.open.set(pair, {
    pair,
    side: "long",
    entry,
    quantity: qty,
    stopLoss: lv.stopLoss,
    takeProfit: lv.takeProfit,
    openedAt: Date.now(),
    quoteSpentUsd: spendUsd,
  })
  log(`OPEN OK ${pair} qty=${qty} entry≈${entry.toFixed(4)} SL=${lv.stopLoss.toFixed(4)} TP=${lv.takeProfit.toFixed(4)}`)
}

async function closeLong(pair: string, reason: string) {
  const p = state.open.get(pair)
  if (!p) return
  const px = await fetchSpotPrice(pair)
  const estPnl = (px - p.entry) * p.quantity
  log(`CLOSE ${pair} reason=${reason} qty=${p.quantity} estPnl≈$${estPnl.toFixed(4)}`)
  try {
    const res = await tradeClose({ symbol: pair, baseQuantity: p.quantity })
    if (!res.ok) {
      log(`CLOSE FAILED ${pair}: ${res.error ?? "unknown"} — will retry`)
      return
    }
    log(`CLOSE OK ${pair}`)
  } catch (e) {
    log(`CLOSE ERROR ${pair}: ${e instanceof Error ? e.message : String(e)} — will retry`)
    return
  }
  state.open.delete(pair)
  rollDay()
  state.realizedPnlUsd += estPnl
  log(`Daily realized PnL ≈ $${state.realizedPnlUsd.toFixed(4)} (UTC day ${state.dailyKey})`)
  if (estPnl < 0) {
    state.consecutiveLosses += 1
    if (state.consecutiveLosses >= 2) {
      state.pausedUntil = Date.now() + CONSEC_LOSS_PAUSE_MS
      log(`PAUSE 1h after 2 consecutive losses (until ${new Date(state.pausedUntil).toISOString()})`)
    }
  } else {
    state.consecutiveLosses = 0
  }
  if (state.realizedPnlUsd <= -DAILY_LOSS_LIMIT_USD) {
    const until = Date.now() + 24 * 60 * 60 * 1000
    state.pausedUntil = Math.max(state.pausedUntil, until)
    log(`Daily loss limit hit (realized≈$${state.realizedPnlUsd.toFixed(2)}). Paused until ${new Date(state.pausedUntil).toISOString()}`)
  }
}

async function monitorPositions() {
  if (isPaused()) return
  rollDay()
  for (const [pair, p] of [...state.open.entries()]) {
    const age = Date.now() - p.openedAt
    let price: number
    try {
      price = await fetchSpotPrice(pair)
    } catch {
      continue
    }
    if (age >= POSITION_MAX_MS) {
      await closeLong(pair, "max_hold_time")
      continue
    }
    if (price >= p.takeProfit) {
      await closeLong(pair, "take_profit")
      continue
    }
    if (price <= p.stopLoss) {
      await closeLong(pair, "stop_loss")
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
  rollDay()
  if (process.env.AUTO_TRADER_ENABLED !== "true") {
    log("AUTO_TRADER_ENABLED is not true — idle")
    return
  }
  if (isPaused()) {
    log(`Paused until ${new Date(state.pausedUntil).toISOString()}`)
    return
  }
  if (state.realizedPnlUsd <= -DAILY_LOSS_LIMIT_USD) {
    state.pausedUntil = Date.now() + 24 * 60 * 60 * 1000
    log("Daily loss limit — pausing 24h")
    return
  }

  for (const sym of symbols) {
    if (isPaused()) break
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

    const hasLong = state.open.has(pair)

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
      if (state.open.size >= MAX_POSITIONS) {
        log(`BUY skipped — max positions ${MAX_POSITIONS}`)
        continue
      }
      const spend = pickSpendUsd()
      if (totalExposureUsd() + spend > MAX_EXPOSURE_USD) {
        log(`BUY skipped — would exceed exposure $${MAX_EXPOSURE_USD}`)
        continue
      }
      try {
        await openLong(pair, spend)
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
  log(`positionUsd=${POSITION_USD_MIN}-${POSITION_USD_MAX} maxPos=${MAX_POSITIONS} maxExposure=$${MAX_EXPOSURE_USD}`)

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
