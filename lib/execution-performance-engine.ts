import { randomUUID } from "crypto"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { refreshStabilityIntelligence } from "@/lib/stability-intelligence-engine"

function requireAdmin() {
  return createAdminClient()
}

function mean(values: number[]) {
  if (values.length === 0) return 0
  return values.reduce((a, b) => a + b, 0) / values.length
}

export async function refreshExecutionPerformance(input: { userId: string; lookbackDays?: number }) {
  const admin = requireAdmin()
  const lookbackDays = Math.max(1, input.lookbackDays ?? 14)
  const sinceIso = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString()

  const { data: memories, error: memErr } = await admin
    .from("TradeMemory")
    .select("*")
    .gte("createdAt", sinceIso)
    .order("createdAt", { ascending: false })
    .limit(500)
  if (memErr) throw new Error(`DB_READ_FAILED: TradeMemory performance read — ${memErr.message}`)

  const rows = (memories ?? []).filter((r) => Number.isFinite(Number(r.pnlUsd)))
  const byRegime = new Map<string, typeof rows>()
  for (const r of rows) {
    const regime = String(r.marketRegime ?? "UNKNOWN")
    byRegime.set(regime, [...(byRegime.get(regime) ?? []), r])
  }
  for (const [regime, list] of byRegime.entries()) {
    const wins = list.filter((r) => r.wasWin === true).length
    const pnl = list.map((r) => Number(r.pnlUsd ?? 0))
    const holds = list.map((r) => Number(r.holdDurationMs ?? 0)).filter((v) => Number.isFinite(v) && v >= 0)
    const reliabilityErrors = list
      .map((r) => {
        const conf = Number(r.calibratedConfidence ?? r.rawConfidence ?? 50) / 100
        const outcome = Number(r.wasWin ? 1 : 0)
        return (conf - outcome) ** 2
      })
      .filter((v) => Number.isFinite(v))
    const snapshot = {
      id: `rps_${randomUUID()}`,
      userId: input.userId,
      marketRegime: regime,
      trades: list.length,
      winRate: list.length > 0 ? wins / list.length : 0,
      avgPnlUsd: mean(pnl),
      avgHoldDurationMs: mean(holds),
      confidenceReliability: mean(reliabilityErrors),
      details: {
        lookbackDays,
        sampleSize: list.length,
      },
    }
    const { error } = await admin.from("RegimePerformanceSnapshot").insert(snapshot)
    if (error) throw new Error(`DB_WRITE_FAILED: RegimePerformanceSnapshot insert — ${error.message}`)
    console.log(
      `[performance-regime] regime=${regime} trades=${snapshot.trades} winRate=${(snapshot.winRate * 100).toFixed(1)} avgPnl=${snapshot.avgPnlUsd.toFixed(3)}`
    )
  }

  const highConfLosses = rows.filter((r) => Number(r.calibratedConfidence ?? r.rawConfidence ?? 0) >= 75 && r.wasWin === false).length
  const lowConfWins = rows.filter((r) => Number(r.calibratedConfidence ?? r.rawConfidence ?? 0) <= 55 && r.wasWin === true).length
  const reliabilityError = mean(
    rows.map((r) => {
      const conf = Number(r.calibratedConfidence ?? r.rawConfidence ?? 50) / 100
      const outcome = Number(r.wasWin ? 1 : 0)
      return (conf - outcome) ** 2
    })
  )
  const { error: confErr } = await admin.from("ConfidenceAuditSnapshot").insert({
    id: `cas_${randomUUID()}`,
    userId: input.userId,
    sampleSize: rows.length,
    highConfidenceLosses: highConfLosses,
    lowConfidenceWins: lowConfWins,
    reliabilityError,
    byRegime: Object.fromEntries(
      [...byRegime.entries()].map(([k, list]) => [
        k,
        { samples: list.length, avgConfidence: mean(list.map((r) => Number(r.calibratedConfidence ?? r.rawConfidence ?? 0))) },
      ])
    ),
  })
  if (confErr) throw new Error(`DB_WRITE_FAILED: ConfidenceAuditSnapshot insert — ${confErr.message}`)
  console.log(
    `[confidence-audit] sample=${rows.length} highConfLosses=${highConfLosses} lowConfWins=${lowConfWins} reliabilityError=${reliabilityError.toFixed(4)}`
  )
  console.log(
    `[signal-reliability] sample=${rows.length} proxyReliabilityError=${reliabilityError.toFixed(4)} drift=${highConfLosses > Math.max(3, rows.length * 0.2) ? "HIGH" : "NORMAL"}`
  )

  const { data: approvals, error: appErr } = await admin
    .from("GovernanceApprovalLog")
    .select("*")
    .eq("userId", input.userId)
    .gte("createdAt", sinceIso)
    .order("createdAt", { ascending: false })
    .limit(500)
  if (appErr) throw new Error(`DB_READ_FAILED: GovernanceApprovalLog read — ${appErr.message}`)
  const appRows = approvals ?? []
  const denials = appRows.filter((r) => String(r.status) !== "APPROVED")
  const approved = appRows.filter((r) => String(r.status) === "APPROVED")
  const blockedWouldBeWinRate = rows.length > 0 && denials.length > 0 ? Math.min(0.5, lowConfWins / Math.max(1, denials.length)) : null
  const approvedLossRate = rows.length > 0 && approved.length > 0 ? highConfLosses / Math.max(1, approved.length) : null
  const denialRate = appRows.length > 0 ? denials.length / appRows.length : 0
  const { error: geErr } = await admin.from("GovernanceEffectivenessSnapshot").insert({
    id: `ges_${randomUUID()}`,
    userId: input.userId,
    approvals: approved.length,
    denials: denials.length,
    denialRate,
    blockedWouldBeWinRate,
    approvedLossRate,
    details: { lookbackDays },
  })
  if (geErr) throw new Error(`DB_WRITE_FAILED: GovernanceEffectivenessSnapshot insert — ${geErr.message}`)
  console.log(
    `[governance-effectiveness] approvals=${approved.length} denials=${denials.length} denialRate=${(denialRate * 100).toFixed(1)}`
  )

  const { data: orders, error: ordErr } = await admin
    .from("TradeOrder")
    .select("*")
    .eq("userId", input.userId)
    .gte("createdAt", sinceIso)
    .order("createdAt", { ascending: false })
    .limit(1000)
  if (ordErr) throw new Error(`DB_READ_FAILED: TradeOrder execution quality read — ${ordErr.message}`)
  const orderRows = (orders ?? []).filter((o) => o.status === "FILLED")
  const fillLatencies = orderRows
    .map((o) => {
      const c = new Date(String(o.createdAt)).getTime()
      const f = new Date(String(o.filledAt ?? o.createdAt)).getTime()
      const d = f - c
      return Number.isFinite(d) && d >= 0 ? d : null
    })
    .filter((v): v is number => v !== null)
  const quotePerSecond = orderRows
    .map((o) => {
      const c = new Date(String(o.createdAt)).getTime()
      const f = new Date(String(o.filledAt ?? o.createdAt)).getTime()
      const sec = Math.max(1, (f - c) / 1000)
      return Number(o.quoteAmount ?? 0) / sec
    })
    .filter((v) => Number.isFinite(v))
  const avgFillLatencyMs = mean(fillLatencies)
  const avgQuotePerSecond = quotePerSecond.length > 0 ? mean(quotePerSecond) : null
  const slippageProxy = mean(
    rows
      .map((r) => {
        const e = Number(r.entryPrice ?? 0)
        const x = Number(r.exitPrice ?? 0)
        if (!Number.isFinite(e) || !Number.isFinite(x) || e <= 0 || x <= 0) return null
        return Math.abs(x - e) / e
      })
      .filter((v): v is number => v !== null)
  )
  const stressPenalty = Math.min(1, (avgFillLatencyMs / 60_000) * 0.6 + (avgQuotePerSecond !== null && avgQuotePerSecond < 3 ? 0.4 : 0))
  const { error: exErr } = await admin.from("ExecutionQualitySnapshot").insert({
    id: `eqs_${randomUUID()}`,
    userId: input.userId,
    avgFillLatencyMs,
    avgQuotePerSecond,
    stressPenalty,
    details: { filledOrders: orderRows.length, lookbackDays, slippageProxy },
  })
  if (exErr) throw new Error(`DB_WRITE_FAILED: ExecutionQualitySnapshot insert — ${exErr.message}`)
  console.log(
    `[execution-quality] filled=${orderRows.length} avgFillLatencyMs=${avgFillLatencyMs.toFixed(1)} stressPenalty=${stressPenalty.toFixed(3)}`
  )
  console.log(`[slippage-analysis] sample=${rows.length} slippageProxy=${slippageProxy.toFixed(5)}`)

  try {
    await refreshStabilityIntelligence({ userId: input.userId, force: true, minRefreshMs: 0 })
  } catch (e) {
    console.warn(
      `[performance-drift] stability-refresh-failed userId=${input.userId} error=${e instanceof Error ? e.message : String(e)}`
    )
  }

  return {
    sampleTrades: rows.length,
    regimes: byRegime.size,
    reliabilityError,
    denialRate,
    avgFillLatencyMs,
    stressPenalty,
  }
}
