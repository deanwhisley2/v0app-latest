/**
 * Background FAST analysis + optional controlled NEX execution (safe mode).
 *
 * When ENABLE_TRADING is true: persists analysis, posts NEX/abort APIs (needs Next.js + env).
 * Controlled test profile: MAX_TRADES / MAX_LOSS / TRADE_AMOUNT_USD tuned in-script.
 *
 * Run: npx tsx scripts/background-engine.ts
 * Stop: Ctrl+C
 */

import { config } from "dotenv"
import { resolve } from "node:path"

import { computeAnalysisTtlSeconds } from "../lib/expert/analysis-ttl"
import {
  acquireOrchestrationLease,
  getDaemonSymbolRuntime,
  heartbeatOrchestrationLease,
  updateDaemonSymbolRuntime,
} from "../lib/daemon-runtime-authority"
import { requestGovernanceApproval } from "../lib/global-execution-governor"
import { createAnalysis, makeId } from "../lib/expert/phase2-store"
import { getResumeGate } from "../lib/startup-recovery"
import { timeBoundAnalysis } from "../lib/analysis/time-bound-analysis"

config({ path: resolve(process.cwd(), ".env.local") })

const MAX_TRADES = 3
/** USD — cumulative realized loss cap for this controlled live test. */
const MAX_LOSS = 5

/** Live routing on (confirmation, cooldown, TTL, limits unchanged). */
const ENABLE_TRADING = true

/** Smallest practical test size ($USDT quote on Binance spot). */
const TRADE_AMOUNT_USD = 6

const SYMBOL = "BTCUSDT"
const TIME_WINDOW_MS = 60_000
const INTERVAL_MS = 15_000

/** Minimum time between OPPORTUNITY events (same as execution spacing when trading disabled). */
const COOLDOWN_MS = 60_000 // 1 minute (adjustable)

/** Do not submit SELL until this long after a BUY fill. */
const MIN_HOLD_MS = 60_000

/** Same-origin Expert APIs when Next dev server is running. */
const API_BASE = process.env.BACKGROUND_ENGINE_API_BASE?.replace(/\/$/, "") ?? "http://127.0.0.1:3000"

/** Must match server `NEXUS_EXPERT_FALLBACK_USER_ID` for cookie-less script execution. */
function expertEngineUserId(): string | null {
  const id = process.env.NEXUS_EXPERT_FALLBACK_USER_ID?.trim()
  return id || null
}

type NexBuyResponseJson = {
  sessionId?: string
  fill?: {
    side: "BUY"
    avgPrice: number
    quantity: number
    totalCost: number
  }
}

type SessionAbortJson = {
  fill?: {
    side: "SELL"
    avgPrice: number
    quantity: number
    proceeds: number
  }
  liquidationValue?: number
  closed?: boolean
}

/** Full response body JSON; returns null on invalid JSON (never throws). */
function safeJsonParse(str: string): unknown | null {
  try {
    return JSON.parse(str) as unknown
  } catch {
    return null
  }
}

/** Apply realized USDT PnL; only increases cumulative loss window on losses. */
function applyRealizedPnlUsd(entryQuoteCost: number, proceedsQuote: number, totalLoss: number): number {
  const pnlUsd = proceedsQuote - entryQuoteCost
  let nextLoss = totalLoss
  const prevLoss = nextLoss
  if (pnlUsd < 0) {
    nextLoss += Math.abs(pnlUsd)
  }
  console.log(
    `[risk-window] realized=${pnlUsd.toFixed(4)} totalLoss(now)=$${nextLoss.toFixed(2)} max=$${MAX_LOSS} prev=$${prevLoss.toFixed(2)}`
  )
  return nextLoss
}

function logRiskState(
  tag: string,
  state: { position: "flat" | "LONG"; openPosition: { sessionId: string; quantity: number } | null; tradesCount: number; totalLoss: number }
): void {
  const detail = state.position === "LONG" && state.openPosition ? `LONG session=${state.openPosition.sessionId.slice(0, 12)}… qty=${state.openPosition.quantity.toFixed(8)}` : state.position
  console.log(
    `[risk-window] ${tag} tradesUsed=${state.tradesCount}/${MAX_TRADES} totalLoss=$${state.totalLoss.toFixed(2)}/$${MAX_LOSS} ${detail}`
  )
}

async function canRunAutonomousExecution() {
  const gate = await getResumeGate()
  if (gate.status !== "SAFE_TO_RESUME") {
    console.log(
      `[resume-blocked] background-engine gate=${gate.status} unresolved=${gate.unresolvedCount} reason=${gate.reason ?? "-"}`
    )
    return false
  }
  return true
}

async function executeNexTrade(params: {
  analysisId: string
  symbol: string
  amountUsd: number
}): Promise<{ ok: boolean; status: number; body: string; json: NexBuyResponseJson | null }> {
  const res = await fetch(`${API_BASE}/api/expert/execute/nex`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      symbol: params.symbol,
      analysisId: params.analysisId,
      config: {
        totalAmount: params.amountUsd,
        entryDelayMinutes: 0,
        maxTradeDurationMinutes: 120,
        stopProfitPercent: 2,
        stopLossPercent: 2,
      },
    }),
  })
  const text = await res.text()
  const parsed = safeJsonParse(text) as NexBuyResponseJson | null
  return { ok: res.ok, status: res.status, body: text, json: parsed && typeof parsed === "object" ? parsed : null }
}

async function closeNexSession(sessionId: string): Promise<{
  ok: boolean
  status: number
  body: string
  json: SessionAbortJson | null
}> {
  const res = await fetch(`${API_BASE}/api/expert/session/${encodeURIComponent(sessionId)}/abort`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ force: true }),
  })
  const text = await res.text()
  const parsed = safeJsonParse(text) as SessionAbortJson | null
  return { ok: res.ok, status: res.status, body: text, json: parsed && typeof parsed === "object" ? parsed : null }
}

async function runLoop(): Promise<void> {
  const workerId = `bg_${Math.random().toString(36).slice(2, 10)}`
  const leaseKey = `background-engine:${SYMBOL}`
  process.stdout.write(
    `[background-engine] starting · symbol=${SYMBOL} · fastMode=true · interval=${INTERVAL_MS / 1000}s · cooldown=${COOLDOWN_MS / 1000}s · minHold=${MIN_HOLD_MS / 1000}s · MAX_TRADES=${MAX_TRADES} · MAX_LOSS=$${MAX_LOSS} · ENABLE_TRADING=${ENABLE_TRADING} · TRADE_AMOUNT_USD=${TRADE_AMOUNT_USD}\n`
  )

  while (true) {
    try {
      const lease = await acquireOrchestrationLease({ leaseKey, workerId, ttlMs: Math.max(120_000, INTERVAL_MS * 4) })
      if (!lease.acquired) {
        console.log(`[worker-takeover] leaseKey=${leaseKey} owner=${lease.ownerId}`)
        await new Promise((r) => setTimeout(r, INTERVAL_MS))
        continue
      }
      await heartbeatOrchestrationLease({ leaseKey, workerId, ttlMs: Math.max(120_000, INTERVAL_MS * 4) })
      if (!(await canRunAutonomousExecution())) {
        await new Promise((r) => setTimeout(r, INTERVAL_MS))
        continue
      }
      const userId = expertEngineUserId()
      if (!userId) {
        console.error(`[background-engine] missing NEXUS_EXPERT_FALLBACK_USER_ID`)
        await new Promise((r) => setTimeout(r, INTERVAL_MS))
        continue
      }
      const runtime = await getDaemonSymbolRuntime({ daemonType: "background-engine", userId, symbol: SYMBOL })
      const position = runtime.positionStatus === "LONG" ? "LONG" : "flat"
      const openPosition =
        runtime.positionStatus === "LONG" && runtime.openSessionId && runtime.openQuantity && runtime.openEntryCost
          ? {
              sessionId: runtime.openSessionId,
              quantity: runtime.openQuantity,
              entryQuoteCost: runtime.openEntryCost,
              avgEntryPrice: runtime.openEntryPrice ?? 0,
            }
          : null
      const tradesCount = Number(runtime.tradeCountWindow ?? 0)
      const totalLoss = Number(runtime.totalLossWindow ?? 0)
      const lastExecutionTime = runtime.lastExecutionAt ? new Date(runtime.lastExecutionAt).getTime() : null
      const lastEntryTime = runtime.lastEntryAt ? new Date(runtime.lastEntryAt).getTime() : null

      const result = await timeBoundAnalysis.startAnalysis({
        symbol: SYMBOL,
        timeWindowMs: TIME_WINDOW_MS,
        includeGrok: false,
        fastMode: true,
      })

      const ts = new Date().toISOString()
      const action = result.fusedDecision.action
      const confidence = result.fusedDecision.confidence
      const mode = result.mode ?? "(unset)"

      const streakAction = runtime.streakAction
      const nextStreakCount = action !== "HOLD" && action === streakAction ? runtime.streakCount + 1 : action === "HOLD" ? 0 : 1
      const isConfirmed = action !== "HOLD" && nextStreakCount >= 3

      console.log(
        `[background-engine] ${ts} · action=${action} · confidence=${confidence}% · mode=${mode}`
      )
      console.log(
        `[signal-streak] action=${action} prev=${streakAction ?? "-"} count=${nextStreakCount} confirmed=${isConfirmed}`
      )
      console.log(
        `[background-engine] risk · tradesCount=${tradesCount}/${MAX_TRADES} · totalLoss=$${totalLoss.toFixed(2)}/$${MAX_LOSS} · position=${position}`
      )

      const now = Date.now()
      const inCooldown =
        lastExecutionTime !== null && now - lastExecutionTime < COOLDOWN_MS

      if (confidence >= 85 && isConfirmed && inCooldown) {
        console.log(`[background-engine] SKIPPED (cooldown active)`)
      }

      const thresholdMet = confidence >= 85 && isConfirmed && !inCooldown

      await updateDaemonSymbolRuntime(
        { daemonType: "background-engine", userId, symbol: SYMBOL, expectedVersion: runtime.version },
        {
          streakAction: action === "HOLD" ? null : action,
          streakCount: nextStreakCount,
          streakUpdatedAt: new Date().toISOString(),
        }
      )

      if (!thresholdMet) {
        await new Promise((r) => setTimeout(r, INTERVAL_MS))
        continue
      }

      if (tradesCount >= MAX_TRADES) {
        console.log(`[background-engine] SKIPPED (max trades reached)`)
        await new Promise((r) => setTimeout(r, INTERVAL_MS))
        continue
      }

      if (totalLoss >= MAX_LOSS) {
        console.log(`[background-engine] SKIPPED (max loss reached)`)
        await new Promise((r) => setTimeout(r, INTERVAL_MS))
        continue
      }

      if (ENABLE_TRADING && action === "BUY" && position === "LONG") {
        console.log(`[background-engine] SKIPPED (already long)`)
        await new Promise((r) => setTimeout(r, INTERVAL_MS))
        continue
      }

      if (ENABLE_TRADING && action === "SELL" && position === "flat") {
        console.log(`[background-engine] SKIPPED (no position)`)
        await new Promise((r) => setTimeout(r, INTERVAL_MS))
        continue
      }

      if (ENABLE_TRADING && action === "SELL") {
        if (!lastEntryTime) {
          console.log(`[background-engine] SKIPPED (missing entry time)`)
          await new Promise((r) => setTimeout(r, INTERVAL_MS))
          continue
        }
        if (Date.now() - lastEntryTime < MIN_HOLD_MS) {
          console.log(`[background-engine] SKIPPED (min hold active)`)
          await new Promise((r) => setTimeout(r, INTERVAL_MS))
          continue
        }
      }

      const opportunityTradesCount = tradesCount + 1
      const nowIso = new Date().toISOString()
      const afterOpportunity = await getDaemonSymbolRuntime({ daemonType: "background-engine", userId, symbol: SYMBOL })
      await updateDaemonSymbolRuntime(
        { daemonType: "background-engine", userId, symbol: SYMBOL, expectedVersion: afterOpportunity.version },
        {
          tradeCountWindow: opportunityTradesCount,
          windowStart: afterOpportunity.windowStart ?? nowIso,
          lastExecutionAt: nowIso,
        }
      )

      console.log(
        `[background-engine] OPPORTUNITY · action=${action} · confidence=${confidence}% · confirmed×3 · ENABLE_TRADING=${ENABLE_TRADING}`
      )

      if (!ENABLE_TRADING) {
        console.log(
          `[background-engine] WOULD EXECUTE · action=${action} · amount=$${TRADE_AMOUNT_USD} · skipped (ENABLE_TRADING=false)`
        )
        await new Promise((r) => setTimeout(r, INTERVAL_MS))
        continue
      }

      try {
        const analysisId = makeId("analysis")
        const timeWindowSeconds = Math.floor(TIME_WINDOW_MS / 1000)
        const ttlSeconds = computeAnalysisTtlSeconds({
          mode: result.mode,
          timeWindowSeconds,
        })

        const analysisRow = await createAnalysis({
          id: analysisId,
          userId,
          symbol: SYMBOL,
          timeWindow: timeWindowSeconds,
          action: result.fusedDecision.action,
          confidence: result.fusedDecision.confidence,
          reasons: result.fusedDecision.reasons,
          entryPrice: undefined,
          tradeExecuted: false,
          ttlSeconds,
        })
        const ageSeconds = (Date.now() - new Date(analysisRow.timestamp).getTime()) / 1000
        console.log(
          `[background-engine] analysis prepared · id=${analysisId} · timestamp=${analysisRow.timestamp} · ttlSeconds=${ttlSeconds} · ageSeconds=${Math.max(
            0,
            Math.round(ageSeconds)
          )}`
        )

        if (action === "SELL" && position === "LONG" && openPosition) {
          const gov = await requestGovernanceApproval({
            workerId,
            lane: "background-engine",
            userId,
            symbol: SYMBOL,
            action: "SELL",
          })
          if (!gov.approved) {
            console.warn(`[worker-governance] SELL denied status=${gov.status} reason=${gov.reason ?? "-"}`)
            await new Promise((r) => setTimeout(r, INTERVAL_MS))
            continue
          }
          console.log(
            `[background-engine] LIVE SELL · closing position · session=${openPosition.sessionId} · confidence=${confidence}%`
          )

          const closed = await closeNexSession(openPosition.sessionId)

          if (!closed.ok) {
            console.error(
              `[background-engine] LIVE SELL · close failed · HTTP ${closed.status} · ${closed.body}`
            )
          } else {
            console.log(
              `[background-engine] LIVE SELL · HTTP ${closed.status} · body=${closed.body.slice(0, 400)}`
            )
            const data = safeJsonParse(closed.body)
            const sellFill =
              data !== null &&
              typeof data === "object" &&
              "fill" in data &&
              typeof (data as { fill: unknown }).fill === "object" &&
              (data as { fill: unknown }).fill !== null
                ? ((data as { fill: Record<string, unknown> }).fill)
                : null

            const isValidSellFill =
              sellFill !== null &&
              typeof sellFill === "object" &&
              typeof sellFill.proceeds === "number"

            if (closed.ok && !isValidSellFill) {
              console.warn("[background-engine] WARNING (incomplete SELL execution response)")
            }

            try {
              const basis = openPosition.entryQuoteCost
              if (isValidSellFill && sellFill && typeof sellFill.proceeds === "number") {
                const proceeds = sellFill.proceeds
                const avgPrice = typeof sellFill.avgPrice === "number" ? sellFill.avgPrice : 0
                const qty = typeof sellFill.quantity === "number" ? sellFill.quantity : 0
                console.log(
                  `[background-engine] LIVE SELL FILLED · avgPrice=${avgPrice.toFixed(6)} · qty=${qty.toFixed(8)} · proceeds=$${proceeds.toFixed(4)} vs entryCost=$${basis.toFixed(4)}`
                )
                const nextLoss = applyRealizedPnlUsd(basis, proceeds, totalLoss)
                const runtimeNow = await getDaemonSymbolRuntime({ daemonType: "background-engine", userId, symbol: SYMBOL })
                await updateDaemonSymbolRuntime(
                  { daemonType: "background-engine", userId, symbol: SYMBOL, expectedVersion: runtimeNow.version },
                  {
                    positionStatus: "FLAT",
                    openSessionId: null,
                    openQuantity: null,
                    openEntryPrice: null,
                    openEntryCost: null,
                    lastEntryAt: null,
                    totalLossWindow: nextLoss,
                  }
                )
                logRiskState("after SELL + PnL", {
                  position: "flat",
                  openPosition: null,
                  tradesCount: opportunityTradesCount,
                  totalLoss: nextLoss,
                })
              } else if (!isValidSellFill) {
                console.error(
                  `[background-engine] PnL parse skipped · missing fill in close response (session kept for retry)`
                )
              }
            } catch (pnlErr) {
              const msg = pnlErr instanceof Error ? pnlErr.message : String(pnlErr)
              console.error(`[background-engine] PnL error (non-fatal): ${msg}`)
            }
          }
        } else if (action === "BUY") {
          const gov = await requestGovernanceApproval({
            workerId,
            lane: "background-engine",
            userId,
            symbol: SYMBOL,
            action: "BUY",
            requestedQuoteUsd: TRADE_AMOUNT_USD,
          })
          if (!gov.approved) {
            console.warn(`[worker-governance] BUY denied status=${gov.status} reason=${gov.reason ?? "-"}`)
            await new Promise((r) => setTimeout(r, INTERVAL_MS))
            continue
          }
          console.log(
            `[background-engine] LIVE BUY · submitting · confidence=${confidence}% · quoteSpend=$${TRADE_AMOUNT_USD}`
          )

          const exec = await executeNexTrade({
            analysisId,
            symbol: SYMBOL,
            amountUsd: TRADE_AMOUNT_USD,
          })

          if (!exec.ok) {
            console.error(
              `[background-engine] LIVE BUY · failed · HTTP ${exec.status} · ${exec.body}`
            )
          } else {
            console.log(`[background-engine] LIVE BUY · HTTP ${exec.status} · body=${exec.body.slice(0, 400)}`)
            const data = safeJsonParse(exec.body)
            type BuyFill = { side: "BUY"; avgPrice: number; quantity: number; totalCost: number }
            const buyFill =
              data !== null &&
              typeof data === "object" &&
              "fill" in data &&
              typeof (data as { fill: unknown }).fill === "object" &&
              (data as { fill: unknown }).fill !== null
                ? ((data as {
                    fill: { side?: unknown; avgPrice?: unknown; quantity?: unknown; totalCost?: unknown }
                  }).fill)
                : null

            const isValidBuyFill =
              buyFill !== null &&
              buyFill.side === "BUY" &&
              typeof buyFill.avgPrice === "number" &&
              typeof buyFill.quantity === "number" &&
              typeof buyFill.totalCost === "number"
            const typedBuyFill: BuyFill | null = isValidBuyFill ? (buyFill as BuyFill) : null

            if (exec.ok && !isValidBuyFill) {
              console.warn("[background-engine] WARNING (incomplete BUY execution response)")
            }

            try {
              const sid =
                data !== null &&
                typeof data === "object" &&
                "sessionId" in data &&
                typeof (data as { sessionId: unknown }).sessionId === "string"
                  ? (data as { sessionId: string }).sessionId
                  : null
              const buyTrackedOk =
                isValidBuyFill &&
                buyFill !== null &&
                typeof sid === "string"

              if (buyTrackedOk && typedBuyFill && typeof sid === "string") {
                console.log(
                  `[background-engine] LIVE BUY FILLED · avgPrice=${typedBuyFill.avgPrice.toFixed(6)} · qty=${typedBuyFill.quantity.toFixed(8)} · totalCost=$${typedBuyFill.totalCost.toFixed(4)}`
                )
                const runtimeNow = await getDaemonSymbolRuntime({ daemonType: "background-engine", userId, symbol: SYMBOL })
                await updateDaemonSymbolRuntime(
                  { daemonType: "background-engine", userId, symbol: SYMBOL, expectedVersion: runtimeNow.version },
                  {
                    positionStatus: "LONG",
                    openSessionId: sid,
                    openEntryCost: typedBuyFill.totalCost,
                    openEntryPrice: typedBuyFill.avgPrice,
                    openQuantity: typedBuyFill.quantity,
                    lastEntryAt: new Date().toISOString(),
                  }
                )
                logRiskState("after BUY fill", {
                  position: "LONG",
                  openPosition: { sessionId: sid, quantity: typedBuyFill.quantity },
                  tradesCount: opportunityTradesCount,
                  totalLoss,
                })
              } else if (isValidBuyFill) {
                console.error(
                  `[background-engine] sessionId or fill.side invalid — not tracking open position`
                )
              }
            } catch (trackErr) {
              const msg = trackErr instanceof Error ? trackErr.message : String(trackErr)
              console.error(`[background-engine] entry tracking error (non-fatal): ${msg}`)
            }
          }
        }
      } catch (execErr) {
        const msg = execErr instanceof Error ? execErr.message : String(execErr)
        console.error(`[background-engine] execution error: ${msg}`)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[background-engine] error: ${msg}`)
    }

    await new Promise((r) => setTimeout(r, INTERVAL_MS))
  }
}

void runLoop()
