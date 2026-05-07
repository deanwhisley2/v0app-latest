import { NextResponse } from "next/server"
import { getAnalysisById } from "@/lib/expert/phase2-store"

export const ERROR_CODES = {
  ANALYSIS_STALE: "ANALYSIS_STALE",
  ANALYSIS_HOLD: "ANALYSIS_HOLD",
  ANALYSIS_LOW_CONFIDENCE: "ANALYSIS_LOW_CONFIDENCE",
  SYMBOL_MISMATCH: "SYMBOL_MISMATCH",
  INSUFFICIENT_BALANCE: "INSUFFICIENT_BALANCE",
  MINIMUM_ORDER_NOT_MET: "MINIMUM_ORDER_NOT_MET",
  RATE_LIMIT_EXCEEDED: "RATE_LIMIT_EXCEEDED",
  API_PERMISSION_MISSING: "API_PERMISSION_MISSING",
  ORDER_FAILED: "ORDER_FAILED",
  LIQUIDATION_FAILED: "LIQUIDATION_FAILED",
  REAL_TRADING_DISABLED: "REAL_TRADING_DISABLED",
  MISSING_BINANCE_KEYS: "MISSING_BINANCE_KEYS",
  ANALYSIS_NOT_FOUND: "ANALYSIS_NOT_FOUND",
  INVALID_REQUEST: "INVALID_REQUEST",
  EXCHANGE_VALIDATION_FAILED: "EXCHANGE_VALIDATION_FAILED",
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN_SESSION: "FORBIDDEN_SESSION",
  BEHAVIOR_LEARNING_REQUIRED: "BEHAVIOR_LEARNING_REQUIRED",
  EXECUTION_TIMING_REJECT: "EXECUTION_TIMING_REJECT",
  FOCUS_UNIVERSE_REQUIRED: "FOCUS_UNIVERSE_REQUIRED",
  SIGNAL_RHYTHM_REJECT: "SIGNAL_RHYTHM_REJECT",
} as const

export class ExpertRouteError extends Error {
  code: string
  status: number

  constructor(code: string, message: string, status = 400) {
    super(message)
    this.code = code
    this.status = status
  }
}

type AnalysisRecord = NonNullable<Awaited<ReturnType<typeof getAnalysisById>>>

function parseAnalysisTimestampMs(value: string): number {
  // DB `timestamp` (without timezone) can be interpreted as local time by JS Date parsing.
  // Treat timezone-less values as UTC to avoid false stale detections (e.g. ~3h offset).
  const hasTimezone = /(?:Z|[+-]\d{2}:\d{2})$/.test(value)
  const normalized = hasTimezone ? value : `${value}Z`
  const ms = new Date(normalized).getTime()
  return Number.isFinite(ms) ? ms : Number.NaN
}

function normalizeSymbol(value: string): string {
  const clean = value.trim().toUpperCase()
  return clean.endsWith("USDT") ? clean : `${clean}USDT`
}

function parseReasonValue(reasons: string[] | null | undefined, key: string): string | null {
  if (!reasons?.length) return null
  const prefix = `${key}:`
  const hit = reasons.find((r) => r.startsWith(prefix))
  return hit ? hit.slice(prefix.length) : null
}

type ExecutionReadinessInput = Pick<
  AnalysisRecord,
  "id" | "timestamp" | "ttlSeconds" | "action" | "confidence" | "rawConfidence" | "calibratedConfidence" | "reasons"
>

function assertExecutionReadiness(analysis: ExecutionReadinessInput) {
  const createdAtMs = parseAnalysisTimestampMs(analysis.timestamp)
  if (!Number.isFinite(createdAtMs)) {
    throw new ExpertRouteError(
      ERROR_CODES.INVALID_REQUEST,
      `INVALID_REQUEST: Analysis timestamp is invalid (${analysis.timestamp})`,
      400
    )
  }
  const ageSeconds = (Date.now() - createdAtMs) / 1000
  const maxExecutionLatencySec = Math.max(30, Number(process.env.NEXUS_MAX_EXECUTION_LATENCY_SEC) || 120)
  const maxAgeSeconds = analysis.ttlSeconds ?? 60
  console.log(
    `[expert-execute] analysis freshness · id=${analysis.id} · createdAt=${analysis.timestamp} · ttlSeconds=${maxAgeSeconds} · ageSeconds=${Math.round(ageSeconds)}`
  )
  if (ageSeconds > maxAgeSeconds) {
    throw new ExpertRouteError(
      ERROR_CODES.ANALYSIS_STALE,
      `ANALYSIS_STALE: ${Math.round(ageSeconds)}s old, max ${maxAgeSeconds}s. Re-analyze before trading.`,
      400
    )
  }
  if (ageSeconds > maxExecutionLatencySec) {
    throw new ExpertRouteError(
      ERROR_CODES.EXECUTION_TIMING_REJECT,
      `EXECUTION_TIMING_REJECT: analysis-to-execution latency ${Math.round(ageSeconds)}s exceeds ${maxExecutionLatencySec}s.`,
      400
    )
  }
  if (analysis.action === "HOLD") {
    throw new ExpertRouteError(ERROR_CODES.ANALYSIS_HOLD, "ANALYSIS_HOLD: Cannot execute trade on HOLD signal.", 400)
  }
  const rawConfidence = analysis.rawConfidence ?? analysis.confidence
  const calibratedConfidence = analysis.calibratedConfidence ?? analysis.confidence
  const executionConfidence = calibratedConfidence ?? analysis.confidence
  console.log(
    `[confidence-authority] raw=${rawConfidence} calibrated=${calibratedConfidence} usedForExecution=${executionConfidence} source=${analysis.calibratedConfidence != null ? "calibratedConfidence" : "legacy-confidence"}`
  )
  if (executionConfidence < 65) {
    throw new ExpertRouteError(
      ERROR_CODES.ANALYSIS_LOW_CONFIDENCE,
      `ANALYSIS_LOW_CONFIDENCE: ${executionConfidence}% < 65% threshold.`,
      400
    )
  }
  const observationWindowSec = Number.parseInt(parseReasonValue(analysis.reasons, "BEHAVIOR_WINDOW_SEC") ?? "", 10)
  const behaviorClarity = Number.parseInt(parseReasonValue(analysis.reasons, "BEHAVIOR_CLARITY") ?? "", 10)
  const entryTiming = parseReasonValue(analysis.reasons, "ENTRY_TIMING")
  const rhythmState = parseReasonValue(analysis.reasons, "SIGNAL_RHYTHM_STATE")
  const rhythmScore = Number.parseInt(parseReasonValue(analysis.reasons, "SIGNAL_RHYTHM_SCORE") ?? "", 10)
  const inFocusUniverse = analysis.reasons?.includes("FOCUS_UNIVERSE_MEMBER") === true
  if (!inFocusUniverse) {
    throw new ExpertRouteError(
      ERROR_CODES.FOCUS_UNIVERSE_REQUIRED,
      "FOCUS_UNIVERSE_REQUIRED: Symbol is outside current Focus-20+ universe.",
      400
    )
  }
  if (!Number.isFinite(observationWindowSec) || observationWindowSec < 300) {
    throw new ExpertRouteError(
      ERROR_CODES.BEHAVIOR_LEARNING_REQUIRED,
      "BEHAVIOR_LEARNING_REQUIRED: Analysis must include at least 5 minutes of observation before execution.",
      400
    )
  }
  if (!Number.isFinite(behaviorClarity) || behaviorClarity < 55) {
    throw new ExpertRouteError(
      ERROR_CODES.BEHAVIOR_LEARNING_REQUIRED,
      "BEHAVIOR_LEARNING_REQUIRED: Behavior clarity is too low for safe execution.",
      400
    )
  }
  if (entryTiming === "LATE" || entryTiming === "CHASE_ENTRY" || entryTiming === "EXHAUSTED_MOVE") {
    throw new ExpertRouteError(
      ERROR_CODES.EXECUTION_TIMING_REJECT,
      `EXECUTION_TIMING_REJECT: Entry timing class ${entryTiming} is blocked.`,
      400
    )
  }
  if (
    rhythmState === "EXHAUSTING" ||
    (rhythmState === "WEAKENING" && Number.isFinite(rhythmScore) && rhythmScore < 62)
  ) {
    throw new ExpertRouteError(
      ERROR_CODES.SIGNAL_RHYTHM_REJECT,
      `SIGNAL_RHYTHM_REJECT: state=${rhythmState} score=${Number.isFinite(rhythmScore) ? rhythmScore : "n/a"}.`,
      400
    )
  }
}

/** Real-money execution toggle only; Binance keys may come from the signed-in user or env. */
export function enforceRealTradingEnvFlag() {
  if (process.env.NEXUS_REAL_TRADING !== "1") {
    throw new ExpertRouteError(
      ERROR_CODES.REAL_TRADING_DISABLED,
      "REAL_TRADING_DISABLED: Set NEXUS_REAL_TRADING=1 to execute trades",
      403
    )
  }
}

/** @deprecated Use enforceRealTradingEnvFlag + resolveBinanceCredentialsForExecution */
export function enforceRealTradingGuard() {
  enforceRealTradingEnvFlag()
  if (!process.env.BINANCE_API_KEY || !(process.env.BINANCE_SECRET_KEY || process.env.BINANCE_API_SECRET)) {
    throw new ExpertRouteError(
      ERROR_CODES.MISSING_BINANCE_KEYS,
      "MISSING_BINANCE_KEYS: Configure BINANCE_API_KEY and BINANCE_SECRET_KEY (or connect Binance on your account)",
      500
    )
  }
}

export function assertBinanceCredentials(creds: { apiKey?: string; apiSecret?: string } | null) {
  const apiKey = creds?.apiKey?.trim()
  const apiSecret = creds?.apiSecret?.trim()
  if (!apiKey || !apiSecret) {
    throw new ExpertRouteError(
      ERROR_CODES.MISSING_BINANCE_KEYS,
      "MISSING_BINANCE_KEYS: Add Binance in Account / API settings, or set BINANCE_API_KEY and BINANCE_SECRET_KEY on the server.",
      400
    )
  }
}

export async function enforceAnalysisFreshness(
  analysisId: string,
  opts?: { userId?: string }
): Promise<AnalysisRecord> {
  const analysis = await getAnalysisById(analysisId)
  if (!analysis) {
    throw new ExpertRouteError(ERROR_CODES.ANALYSIS_NOT_FOUND, "analysisId not found", 404)
  }
  if (opts?.userId && analysis.userId !== opts.userId) {
    throw new ExpertRouteError(
      ERROR_CODES.FORBIDDEN_SESSION,
      "FORBIDDEN_SESSION: Analysis belongs to another account.",
      403
    )
  }
  assertExecutionReadiness(analysis)
  return analysis
}

export function enforceExecutionReadinessFromRecord(analysis: ExecutionReadinessInput) {
  assertExecutionReadiness(analysis)
}

export function enforceSymbolConsistency(analysisSymbol: string, requestedSymbol?: string) {
  if (!requestedSymbol) return
  if (normalizeSymbol(analysisSymbol) !== normalizeSymbol(requestedSymbol)) {
    throw new ExpertRouteError(
      ERROR_CODES.SYMBOL_MISMATCH,
      `SYMBOL_MISMATCH: Analysis for ${analysisSymbol}, trade for ${requestedSymbol}`,
      400
    )
  }
}

export function mapErrorCode(message: string): string {
  if (message.includes("INSUFFICIENT_BALANCE")) return ERROR_CODES.INSUFFICIENT_BALANCE
  if (message.includes("MIN_NOTIONAL") || message.includes("MIN_ORDER_SIZE")) return ERROR_CODES.MINIMUM_ORDER_NOT_MET
  if (message.includes("SPOT_TRADING_DISABLED")) return ERROR_CODES.API_PERMISSION_MISSING
  if (message.includes("RATE_LIMIT")) return ERROR_CODES.RATE_LIMIT_EXCEEDED
  return ERROR_CODES.EXCHANGE_VALIDATION_FAILED
}

export function errorResponse(error: unknown, fallbackCode: string, fallbackStatus = 500) {
  if (error instanceof ExpertRouteError) {
    return NextResponse.json({ code: error.code, error: error.message }, { status: error.status })
  }
  const message = error instanceof Error ? error.message : "Unexpected error"
  return NextResponse.json({ code: fallbackCode, error: message }, { status: fallbackStatus })
}
