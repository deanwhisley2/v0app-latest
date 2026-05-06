import { randomUUID } from "crypto"
import { createAdminClient } from "@/lib/supabaseAdmin"

export type DriftLevel = "STABLE" | "MINOR_DRIFT" | "MODERATE_DRIFT" | "SEVERE_DRIFT" | "CRITICAL_INSTABILITY"

function requireAdmin() {
  return createAdminClient()
}

function mean(values: number[]) {
  const v = values.filter((x) => Number.isFinite(x))
  if (v.length === 0) return 0
  return v.reduce((a, b) => a + b, 0) / v.length
}

function classifyDrift(maxDriftRatio: number, pressure: number): DriftLevel {
  if (maxDriftRatio >= 0.85 || pressure >= 0.82) return "CRITICAL_INSTABILITY"
  if (maxDriftRatio >= 0.55 || pressure >= 0.65) return "SEVERE_DRIFT"
  if (maxDriftRatio >= 0.32 || pressure >= 0.45) return "MODERATE_DRIFT"
  if (maxDriftRatio >= 0.15 || pressure >= 0.22) return "MINOR_DRIFT"
  return "STABLE"
}

function relativeDrift(base: number, cur: number, eps = 1e-6) {
  const b = Math.max(eps, Math.abs(base))
  return Math.abs(cur - base) / b
}

export async function refreshStabilityIntelligence(input: { userId: string; force?: boolean; minRefreshMs?: number }) {
  const admin = requireAdmin()
  const minMs = Math.max(30_000, input.minRefreshMs ?? 120_000)
  if (!input.force) {
    const { data: lastSnap } = await admin
      .from("StabilitySnapshot")
      .select("createdAt")
      .eq("userId", input.userId)
      .order("createdAt", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (lastSnap?.createdAt && Date.now() - new Date(String(lastSnap.createdAt)).getTime() < minMs) {
      const { data: state } = await admin.from("DriftDetectionState").select("*").eq("userId", input.userId).maybeSingle()
      return state ?? null
    }
  }

  const sinceIso = new Date(Date.now() - 14 * 86400_000).toISOString()

  const [confRows, execRows, govRows] = await Promise.all([
    admin.from("ConfidenceAuditSnapshot").select("*").eq("userId", input.userId).order("createdAt", { ascending: false }).limit(24),
    admin.from("ExecutionQualitySnapshot").select("*").eq("userId", input.userId).order("createdAt", { ascending: false }).limit(24),
    admin.from("GovernanceEffectivenessSnapshot").select("*").eq("userId", input.userId).order("createdAt", { ascending: false }).limit(24),
  ])
  const confData = confRows.data ?? []
  const execData = execRows.data ?? []
  const govData = govRows.data ?? []
  const totalPoints = confData.length + execData.length + govData.length
  if (totalPoints < 8) {
    const neutral = {
      driftLevel: "STABLE" as DriftLevel,
      stabilityPressure: 0,
      regimeInstability: 0,
      executionConsistencyScore: 1,
      drifts: {} as Record<string, number>,
    }
    const { data: existingDds } = await admin.from("DriftDetectionState").select("id").eq("userId", input.userId).maybeSingle()
    await admin.from("DriftDetectionState").upsert(
      {
        id: existingDds?.id ?? `dds_${randomUUID()}`,
        userId: input.userId,
        driftLevel: neutral.driftLevel,
        stabilityPressure: 0,
        details: { reason: "insufficient_snapshot_history", totalPoints },
        updatedAt: new Date().toISOString(),
      },
      { onConflict: "userId" }
    )
    console.log(`[stability-pressure] userId=${input.userId} skipped (insufficient history totalPoints=${totalPoints})`)
    return neutral
  }

  const half = <T>(arr: T[]) => ({
    recent: arr.slice(0, Math.ceil(arr.length / 2)),
    baseline: arr.slice(Math.ceil(arr.length / 2)),
  })

  const c = half(confData)
  const e = half(execData)
  const g = half(govData)

  const baseReliability = mean(c.baseline.map((r) => Number(r.reliabilityError ?? 0)))
  const curReliability = mean(c.recent.map((r) => Number(r.reliabilityError ?? 0)))
  const baseHighLossRate = mean(
    c.baseline.map((r) => (Number(r.sampleSize ?? 0) > 0 ? Number(r.highConfidenceLosses ?? 0) / Number(r.sampleSize ?? 1) : 0))
  )
  const curHighLossRate = mean(
    c.recent.map((r) => (Number(r.sampleSize ?? 0) > 0 ? Number(r.highConfidenceLosses ?? 0) / Number(r.sampleSize ?? 1) : 0))
  )

  const baseStress = mean(e.baseline.map((r) => Number(r.stressPenalty ?? 0)))
  const curStress = mean(e.recent.map((r) => Number(r.stressPenalty ?? 0)))
  const baseLatency = mean(e.baseline.map((r) => Number(r.avgFillLatencyMs ?? 0)))
  const curLatency = mean(e.recent.map((r) => Number(r.avgFillLatencyMs ?? 0)))
  const slip = (r: { details?: unknown }) =>
    typeof r.details === "object" && r.details !== null && "slippageProxy" in r.details
      ? Number((r.details as { slippageProxy?: number }).slippageProxy ?? 0)
      : 0
  const baseSlippage = mean(e.baseline.map(slip).filter((x) => Number.isFinite(x) && x > 0))
  const curSlippage = mean(e.recent.map(slip).filter((x) => Number.isFinite(x) && x > 0))

  const baseDenial = mean(g.baseline.map((r) => Number(r.denialRate ?? 0)))
  const curDenial = mean(g.recent.map((r) => Number(r.denialRate ?? 0)))

  let regimeInstability = 0
  const { data: mssRows } = await admin
    .from("MarketStructureSnapshot")
    .select("marketRegime,createdAt")
    .eq("scope", "GLOBAL")
    .gte("createdAt", sinceIso)
    .order("createdAt", { ascending: true })
    .limit(500)
  if (mssRows && mssRows.length > 3) {
    let transitions = 0
    for (let i = 1; i < mssRows.length; i++) {
      if (String(mssRows[i].marketRegime) !== String(mssRows[i - 1].marketRegime)) transitions += 1
    }
    regimeInstability = Math.min(1, transitions / Math.max(8, mssRows.length * 0.15))
    if (regimeInstability >= 0.45) {
      console.log(`[regime-instability] transitions=${transitions} score=${regimeInstability.toFixed(3)}`)
    }
  }

  const { count: critCount } = await admin
    .from("ExchangeReconciliationLog")
    .select("*", { count: "exact", head: true })
    .eq("userId", input.userId)
    .gte("createdAt", sinceIso)
    .in("severity", ["HIGH", "CRITICAL"])
  const reconcileStress = Math.min(1, Number(critCount ?? 0) / 15)

  const drifts = {
    confidenceReliability: relativeDrift(baseReliability || 0.18, curReliability || 0.18),
    highConfidenceLossRate: relativeDrift(Math.max(baseHighLossRate, 0.001), Math.max(curHighLossRate, 0.001), 1e-4),
    executionStress: relativeDrift(baseStress || 0.12, curStress || 0.12),
    fillLatency: relativeDrift(Math.max(baseLatency, 500), Math.max(curLatency, 500)),
    slippage: relativeDrift(Math.max(baseSlippage || 0.002, 0.0005), Math.max(curSlippage || 0.002, 0.0005)),
    governanceDenialRate: relativeDrift(Math.max(baseDenial, 0.02), Math.max(curDenial, 0.02)),
    regimeClassification: regimeInstability,
    reconciliationInstability: reconcileStress,
  }

  const stabilityPressure =
    drifts.confidenceReliability * 0.22 +
    drifts.highConfidenceLossRate * 0.2 +
    drifts.executionStress * 0.14 +
    drifts.fillLatency * 0.1 +
    drifts.slippage * 0.08 +
    drifts.governanceDenialRate * 0.06 +
    drifts.regimeClassification * 0.12 +
    drifts.reconciliationInstability * 0.08

  const clampedPressure = Math.max(0, Math.min(1, stabilityPressure))
  let regimeBehavioralInstability = 0
  const { data: rpsRows } = await admin
    .from("RegimePerformanceSnapshot")
    .select("marketRegime,winRate")
    .eq("userId", input.userId)
    .order("createdAt", { ascending: false })
    .limit(80)
  if (rpsRows && rpsRows.length > 6) {
    const byRegime = new Map<string, number[]>()
    for (const r of rpsRows) {
      const k = String(r.marketRegime ?? "UNKNOWN")
      const arr = byRegime.get(k) ?? []
      arr.push(Number(r.winRate ?? 0))
      byRegime.set(k, arr)
    }
    const variances: number[] = []
    for (const rates of byRegime.values()) {
      if (rates.length < 3) continue
      const m = mean(rates)
      variances.push(mean(rates.map((x) => (x - m) ** 2)))
    }
    regimeBehavioralInstability = variances.length ? Math.min(1, mean(variances) * 4) : 0
  }

  const driftsWithRegimePerf = {
    ...drifts,
    regimeBehavioralInstability,
  }
  const maxRatio = Math.max(...Object.values(driftsWithRegimePerf))
  const driftLevel = classifyDrift(maxRatio, Math.min(1, clampedPressure + regimeBehavioralInstability * 0.08))

  const latencySeries = execData.map((r) => Number(r.avgFillLatencyMs ?? 0)).filter((v) => Number.isFinite(v) && v > 0)
  const latMean = mean(latencySeries)
  const latStd =
    latencySeries.length > 2 ? Math.sqrt(mean(latencySeries.map((x) => (x - latMean) ** 2))) : 0
  const executionConsistencyScore = Math.max(0, Math.min(1, 1 - Math.min(1, latStd / Math.max(latMean, 1000))))

  const baselineMetrics = {
    reliabilityError: baseReliability,
    highConfLossRate: baseHighLossRate,
    stressPenalty: baseStress,
    avgFillLatencyMs: baseLatency,
    slippageProxy: baseSlippage,
    denialRate: baseDenial,
  }
  const currentMetrics = {
    reliabilityError: curReliability,
    highConfLossRate: curHighLossRate,
    stressPenalty: curStress,
    avgFillLatencyMs: curLatency,
    slippageProxy: curSlippage,
    denialRate: curDenial,
    regimeInstability,
    reconcileStress,
    regimeBehavioralWinRateVariance: regimeBehavioralInstability,
    drifts: driftsWithRegimePerf,
  }

  const { data: existingBaseline } = await admin
    .from("BehavioralBaseline")
    .select("id")
    .eq("userId", input.userId)
    .eq("windowDays", 14)
    .maybeSingle()
  if (existingBaseline?.id) {
    await admin
      .from("BehavioralBaseline")
      .update({ metrics: baselineMetrics, updatedAt: new Date().toISOString() })
      .eq("id", existingBaseline.id)
  } else {
    await admin.from("BehavioralBaseline").insert({
      id: `bb_${randomUUID()}`,
      userId: input.userId,
      windowDays: 14,
      metrics: baselineMetrics,
    })
  }

  console.log(`[stability-pressure] userId=${input.userId} pressure=${clampedPressure.toFixed(3)} driftLevel=${driftLevel}`)
  if (driftLevel !== "STABLE") {
    console.warn(`[drift-detected] level=${driftLevel} maxRatio=${maxRatio.toFixed(3)} breakdown=${JSON.stringify(driftsWithRegimePerf)}`)
  }
  if (regimeBehavioralInstability >= 0.2) {
    console.warn(`[performance-regime] instabilityScore=${regimeBehavioralInstability.toFixed(3)} (win-rate variance by regime)`)
  }

  const maybeDriftEvent = async (
    subsystem: string,
    logTag: string,
    ratio: number,
    threshold: number,
    baselineVal: number,
    curVal: number
  ) => {
    if (ratio < threshold) return
    console.warn(`[${logTag}] subsystem=${subsystem} baseline=${baselineVal.toFixed(4)} current=${curVal.toFixed(4)} ratio=${ratio.toFixed(3)}`)
    await admin.from("DriftEvent").insert({
      id: `de_${randomUUID()}`,
      userId: input.userId,
      subsystem,
      driftLevel,
      baselineValue: baselineVal,
      currentValue: curVal,
      deltaRatio: ratio,
      reason: `${subsystem}: deviation vs rolling baseline`,
    })
  }

  await maybeDriftEvent("confidence_realism", "confidence-drift", drifts.confidenceReliability, 0.18, baseReliability, curReliability)
  await maybeDriftEvent("high_conf_losses", "confidence-drift", drifts.highConfidenceLossRate, 0.35, baseHighLossRate, curHighLossRate)
  await maybeDriftEvent("execution_stress", "execution-instability", drifts.executionStress, 0.28, baseStress, curStress)
  await maybeDriftEvent("fill_latency", "execution-instability", drifts.fillLatency, 0.35, baseLatency, curLatency)
  await maybeDriftEvent("governance_denial", "governance-drift", drifts.governanceDenialRate, 0.4, baseDenial, curDenial)
  if (drifts.slippage >= 0.35) {
    await maybeDriftEvent("slippage", "slippage-analysis", drifts.slippage, 0.35, baseSlippage || 0, curSlippage || 0)
  }
  if (drifts.reconciliationInstability >= 0.35) {
    console.warn(`[baseline-shift] reconciliation stress=${drifts.reconciliationInstability.toFixed(3)} count=${critCount ?? 0}`)
  }

  const { error: ssErr } = await admin.from("StabilitySnapshot").insert({
    id: `ss_${randomUUID()}`,
    userId: input.userId,
    driftLevel,
    stabilityPressure: clampedPressure,
    regimeInstabilityScore: regimeInstability,
    executionConsistencyScore,
    baselineMetrics,
    currentMetrics,
    details: { maxDriftRatio: maxRatio, drifts: driftsWithRegimePerf },
  })
  if (ssErr) throw new Error(`DB_WRITE_FAILED: StabilitySnapshot insert — ${ssErr.message}`)

  await admin.from("StabilityPressureHistory").insert({
    id: `sph_${randomUUID()}`,
    userId: input.userId,
    stabilityPressure: clampedPressure,
    driftLevel,
    source: "stability-intelligence-engine",
  })

  const { data: existingDds } = await admin.from("DriftDetectionState").select("id").eq("userId", input.userId).maybeSingle()
  const ddsPayload = {
    id: existingDds?.id ?? `dds_${randomUUID()}`,
    userId: input.userId,
    driftLevel,
    stabilityPressure: clampedPressure,
    details: currentMetrics,
    updatedAt: new Date().toISOString(),
  }
  const { error: ddsErr } = await admin.from("DriftDetectionState").upsert(ddsPayload, { onConflict: "userId" })
  if (ddsErr) throw new Error(`DB_WRITE_FAILED: DriftDetectionState upsert — ${ddsErr.message}`)

  return {
    driftLevel,
    stabilityPressure: clampedPressure,
    regimeInstability,
    executionConsistencyScore,
    drifts: driftsWithRegimePerf,
  }
}
