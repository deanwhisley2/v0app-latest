import { NextRequest, NextResponse } from "next/server"
import { requireExpertUserId } from "@/lib/expert/auth-server"
import { appendChatMessage, createSession, makeId } from "@/lib/expert/phase2-store"
import { validateExchange } from "@/lib/expert/exchange-precheck"
import { resolveBinanceCredentialsForExecution } from "@/lib/expert/user-binance"
import type { AutoTradeConfig, TradeOrder, TradeSession } from "@/lib/expert/phase2-types"
import {
  binanceMarketBuyQuote,
  waitOrderTerminal,
} from "@/lib/server/binance-signed-order"
import {
  assertBinanceCredentials,
  enforceAnalysisFreshness,
  enforceRealTradingEnvFlag,
  enforceSymbolConsistency,
  ERROR_CODES,
  errorResponse,
  mapErrorCode,
} from "@/lib/expert/execution-guards"
import {
  acquireExecutionLock,
  commitEntryLifecycleTransaction,
  releaseExecutionLock,
  upsertExecutionState,
  upsertPositionState,
} from "@/lib/runtime-state-authority"
import { requestGovernanceApproval } from "@/lib/global-execution-governor"

type RequestBody = {
  symbol?: string
  analysisId: string
  config: AutoTradeConfig
}

function parseReasonValue(reasons: string[] | undefined, key: string): string | null {
  if (!reasons?.length) return null
  const prefix = `${key}:`
  const hit = reasons.find((r) => r.startsWith(prefix))
  return hit ? hit.slice(prefix.length) : null
}

function classifyLatency(ms: number): "EARLY" | "OPTIMAL" | "LATE" | "DEGRADED" {
  if (ms <= 20_000) return "EARLY"
  if (ms <= 60_000) return "OPTIMAL"
  if (ms <= 120_000) return "LATE"
  return "DEGRADED"
}

function parseAnalysisTimestampMs(value: string): number {
  const hasTimezone = /(?:Z|[+-]\d{2}:\d{2})$/.test(value)
  const normalized = hasTimezone ? value : `${value}Z`
  const ms = new Date(normalized).getTime()
  return Number.isFinite(ms) ? ms : Date.now()
}

function deriveAdaptiveExecutionConfig(
  base: AutoTradeConfig,
  reasons: string[] | undefined
): AutoTradeConfig & { adaptedTotalAmount: number; adaptationNote: string } {
  const tempo = parseReasonValue(reasons, "TEMPO_CLASS") ?? "MEDIUM_TEMPO"
  const clarity = Number.parseInt(parseReasonValue(reasons, "BEHAVIOR_CLARITY") ?? "60", 10)
  const rhythm = parseReasonValue(reasons, "SIGNAL_RHYTHM_STATE") ?? "HESITATING"

  let amountMult = 1
  if (tempo === "FAST_TEMPO" || tempo === "VOLATILITY_EXPANSION") amountMult = 0.85
  if (tempo === "ERRATIC_TEMPO" || tempo === "MANIPULATIVE_TEMPO") amountMult = 0.65
  if (tempo === "SLOW_TEMPO") amountMult = 1.1
  if (rhythm === "HESITATING") amountMult *= 0.8

  const clarityFactor = Math.max(0.55, Math.min(1.05, clarity / 70))
  amountMult *= clarityFactor
  const adaptedTotalAmount = Math.max(1, Math.round(base.totalAmount * amountMult * 100) / 100)

  const stopLossMult =
    tempo === "FAST_TEMPO" || tempo === "VOLATILITY_EXPANSION"
      ? 0.8
      : tempo === "SLOW_TEMPO"
        ? 1.2
        : tempo === "ERRATIC_TEMPO" || tempo === "MANIPULATIVE_TEMPO"
          ? 0.75
          : 1
  const takeProfitMult = tempo === "FAST_TEMPO" ? 0.9 : tempo === "SLOW_TEMPO" ? 1.15 : 1

  return {
    ...base,
    totalAmount: adaptedTotalAmount,
    stopLossPercent: Math.max(0.2, Number((base.stopLossPercent * stopLossMult).toFixed(2))),
    stopProfitPercent: Math.max(0.2, Number((base.stopProfitPercent * takeProfitMult).toFixed(2))),
    adaptedTotalAmount,
    adaptationNote: `tempo=${tempo} clarity=${clarity} rhythm=${rhythm} amountMult=${amountMult.toFixed(2)}`,
  }
}

export async function POST(req: NextRequest) {
  const userOrRes = await requireExpertUserId()
  if (userOrRes instanceof NextResponse) return userOrRes
  const userId = userOrRes

  try {
    enforceRealTradingEnvFlag()
  } catch (error) {
    return errorResponse(error, ERROR_CODES.REAL_TRADING_DISABLED, 403)
  }

  let credsPack: Awaited<ReturnType<typeof resolveBinanceCredentialsForExecution>>
  try {
    credsPack = await resolveBinanceCredentialsForExecution(userId)
    assertBinanceCredentials(credsPack.creds)
  } catch (error) {
    return errorResponse(error, ERROR_CODES.MISSING_BINANCE_KEYS, 400)
  }
  const { creds } = credsPack
  const lockOwner = `nex_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

  let body: RequestBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ code: ERROR_CODES.INVALID_REQUEST, error: "Invalid JSON body" }, { status: 400 })
  }
  let analysis: Awaited<ReturnType<typeof enforceAnalysisFreshness>>
  try {
    analysis = await enforceAnalysisFreshness(body.analysisId, { userId })
    enforceSymbolConsistency(analysis.symbol, body.symbol)
  } catch (error) {
    return errorResponse(error, ERROR_CODES.EXCHANGE_VALIDATION_FAILED, 400)
  }
  if (body.config.totalAmount < 1) {
    return NextResponse.json(
      { code: ERROR_CODES.MINIMUM_ORDER_NOT_MET, error: "MINIMUM_ORDER_NOT_MET: Minimum order is $1" },
      { status: 400 }
    )
  }
  const adaptedConfig = deriveAdaptiveExecutionConfig(body.config, analysis.reasons)
  const analysisToExecutionMs = Math.max(0, Date.now() - parseAnalysisTimestampMs(analysis.timestamp))
  const analysisLatencyClass = classifyLatency(analysisToExecutionMs)

  try {
    await validateExchange(creds, analysis.symbol, adaptedConfig.totalAmount)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Exchange validation failed"
    return NextResponse.json({ code: mapErrorCode(message), error: message }, { status: 400 })
  }
  const entryLock = await acquireExecutionLock({
    lockKey: `entry:${userId}:${analysis.symbol}`,
    ownerId: lockOwner,
    ttlMs: 180_000,
    userId,
    symbol: analysis.symbol,
  })
  if (!entryLock.acquired) {
    return NextResponse.json(
      { code: ERROR_CODES.ORDER_FAILED, error: "ORDER_FAILED: another entry execution is already in progress." },
      { status: 409 }
    )
  }

  try {
    const governance = await requestGovernanceApproval({
      workerId: lockOwner,
      lane: "expert-nex",
      userId,
      symbol: analysis.symbol,
      action: "BUY",
      requestedQuoteUsd: adaptedConfig.totalAmount,
    })
    if (!governance.approved) {
      return NextResponse.json(
        {
          code: ERROR_CODES.ORDER_FAILED,
          error: `ORDER_FAILED: governance denied (${governance.status})${governance.reason ? ` - ${governance.reason}` : ""}`,
        },
        { status: 409 }
      )
    }

    const sessionId = makeId("session")
    const executeAt = new Date(Date.now() + Math.max(0, adaptedConfig.entryDelayMinutes) * 60_000)
    const session: TradeSession = {
    id: sessionId,
    userId,
    symbol: analysis.symbol,
    mode: "NEX",
    status: "PENDING",
    totalAmount: adaptedConfig.totalAmount,
    usedAmount: 0,
    startTime: new Date().toISOString(),
    config: {
      ...adaptedConfig,
      analysisId: body.analysisId,
      analysisLatencyMs: analysisToExecutionMs,
      analysisLatencyClass,
      behaviorAdaptiveExecution: true,
      behaviorAdaptationNote: adaptedConfig.adaptationNote,
      rawConfidence: analysis.rawConfidence ?? analysis.confidence,
      calibratedConfidence: analysis.calibratedConfidence ?? analysis.confidence,
      marketRegime: String(governance.exposureSnapshot.marketRegime ?? "UNKNOWN"),
    },
  }
    console.log(
    `[expert-execute] nex session=${sessionId} symbol=${analysis.symbol} rawConfidence=${analysis.rawConfidence ?? analysis.confidence} calibratedConfidence=${analysis.calibratedConfidence ?? analysis.confidence} marketRegime=${String(governance.exposureSnapshot.marketRegime)}`
  )
    console.log(
    `[runtime-market-state] consumer=expert-nex sessionConfigRegime=${String(governance.exposureSnapshot.marketRegime)} degraded=${Boolean(governance.exposureSnapshot.authoritativeMarketDegraded)}`
  )
    console.log(
    `[confidence-authority] raw=${analysis.rawConfidence ?? analysis.confidence} calibrated=${analysis.calibratedConfidence ?? analysis.confidence} usedForExecution=${analysis.calibratedConfidence ?? analysis.confidence} source=${analysis.calibratedConfidence != null ? "calibratedConfidence" : "legacy-confidence"}`
  )
    await createSession(session)
  await upsertExecutionState({
    sessionId,
    userId,
    symbol: analysis.symbol,
    status: "PENDING",
  })
  await upsertPositionState({
    userId,
    symbol: analysis.symbol,
    sessionId,
    status: "PENDING_ENTRY",
    quantity: 0,
    entryPrice: null,
  })
  await appendChatMessage(sessionId, {
    type: "pending",
    content:
      adaptedConfig.entryDelayMinutes > 0
        ? `NEX delay configured (${adaptedConfig.entryDelayMinutes}m). Executing immediate safety-checked entry now.`
        : "NEX executing immediate safety-checked entry.",
  })
  await appendChatMessage(sessionId, {
    type: "status",
    content: `Execution latency ${analysisToExecutionMs}ms (${analysisLatencyClass}); behavior-adaptive size $${adaptedConfig.totalAmount.toFixed(2)}.`,
  })

    const orders: TradeOrder[] = []
    const { apiKey, apiSecret } = creds
    let failedReason: string | null = null
    try {
    const buy = await binanceMarketBuyQuote(analysis.symbol, adaptedConfig.totalAmount.toFixed(8), apiKey, apiSecret)
    const terminal = await waitOrderTerminal(analysis.symbol, buy.orderId, apiKey, apiSecret, 90_000)
    const executedQty = Number.parseFloat(terminal.executedQty || buy.executedQty || "0")
    const quote = Number.parseFloat(terminal.cummulativeQuoteQty || buy.cummulativeQuoteQty || "0")
    const avgPrice = executedQty > 0 ? quote / executedQty : 0
    orders.push({
      id: makeId("row"),
      sessionId,
      userId,
      symbol: analysis.symbol,
      orderId: String(buy.orderId),
      type: "BUY",
      price: avgPrice,
      quantity: executedQty,
      quoteAmount: quote || adaptedConfig.totalAmount,
      status: terminal.status === "FILLED" ? "FILLED" : "FAILED",
      createdAt: new Date().toISOString(),
      filledAt: terminal.status === "FILLED" ? new Date().toISOString() : undefined,
    })
    session.usedAmount = quote || adaptedConfig.totalAmount
    session.status = terminal.status === "FILLED" ? "ACTIVE" : "ABORTED"
    if (session.status === "ABORTED") {
      session.endTime = new Date().toISOString()
    }
    await appendChatMessage(sessionId, {
      type: "order",
      content: `NEX BUY ${analysis.symbol}: ${executedQty.toFixed(6)} @ ${avgPrice.toFixed(6)} (order ${buy.orderId})`,
    })
    } catch (error) {
    session.status = "ABORTED"
    session.endTime = new Date().toISOString()
    failedReason = error instanceof Error ? error.message : "Unknown Binance error"
    await appendChatMessage(sessionId, {
      type: "error",
      content: `NEX entry failed: ${failedReason}`,
    })
  }

    const first = orders[0]
    await commitEntryLifecycleTransaction({
      sessionId,
      userId,
      symbol: analysis.symbol,
      sessionStatus: session.status,
      usedAmount: session.usedAmount,
      endTime: session.endTime ?? null,
      orders: orders as unknown as Array<Record<string, unknown>>,
      positionStatus: session.status === "ACTIVE" && first ? "LONG" : "FLAT",
      positionQty: session.status === "ACTIVE" && first ? first.quantity : 0,
      positionEntryPrice: session.status === "ACTIVE" && first ? first.price : null,
      executionStatus: session.status === "ACTIVE" ? "ACTIVE" : "ABORTED",
      executionLastError: failedReason,
      lastExecutionAt: new Date().toISOString(),
    })

    if (failedReason) {
      return NextResponse.json(
        { code: ERROR_CODES.ORDER_FAILED, error: `ORDER_FAILED: ${failedReason}`, sessionId },
        { status: 502 }
      )
    }

    let fill:
    | {
        side: "BUY"
        avgPrice: number
        quantity: number
        totalCost: number
      }
    | undefined
    if (session.status === "ACTIVE" && orders.length > 0) {
    const o = orders[0]
    fill = {
      side: "BUY",
      avgPrice: o.price,
      quantity: o.quantity,
      totalCost: o.quoteAmount,
    }
  }

    return NextResponse.json({
      sessionId,
      status: session.status === "ABORTED" ? "aborted" : "started",
      executeAt: executeAt.toISOString(),
      ...(fill ? { fill } : {}),
    })
  } finally {
    await releaseExecutionLock({
      lockKey: `entry:${userId}:${analysis.symbol}`,
      ownerId: lockOwner,
      userId,
      symbol: analysis.symbol,
    })
  }
}
