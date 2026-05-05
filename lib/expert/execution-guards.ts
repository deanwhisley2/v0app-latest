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

function normalizeSymbol(value: string): string {
  const clean = value.trim().toUpperCase()
  return clean.endsWith("USDT") ? clean : `${clean}USDT`
}

export function enforceRealTradingGuard() {
  if (process.env.NEXUS_REAL_TRADING !== "1") {
    throw new ExpertRouteError(
      ERROR_CODES.REAL_TRADING_DISABLED,
      "REAL_TRADING_DISABLED: Set NEXUS_REAL_TRADING=1 to execute trades",
      403
    )
  }
  if (!process.env.BINANCE_API_KEY || !(process.env.BINANCE_SECRET_KEY || process.env.BINANCE_API_SECRET)) {
    throw new ExpertRouteError(
      ERROR_CODES.MISSING_BINANCE_KEYS,
      "MISSING_BINANCE_KEYS: Configure BINANCE_API_KEY and BINANCE_SECRET_KEY",
      500
    )
  }
}

export async function enforceAnalysisFreshness(analysisId: string, maxAgeSeconds = 60): Promise<AnalysisRecord> {
  const analysis = await getAnalysisById(analysisId)
  if (!analysis) {
    throw new ExpertRouteError(ERROR_CODES.ANALYSIS_NOT_FOUND, "analysisId not found", 404)
  }
  const ageSeconds = (Date.now() - new Date(analysis.timestamp).getTime()) / 1000
  if (ageSeconds > maxAgeSeconds) {
    throw new ExpertRouteError(
      ERROR_CODES.ANALYSIS_STALE,
      `ANALYSIS_STALE: ${Math.round(ageSeconds)}s old, max ${maxAgeSeconds}s. Re-analyze before trading.`,
      400
    )
  }
  if (analysis.action === "HOLD") {
    throw new ExpertRouteError(ERROR_CODES.ANALYSIS_HOLD, "ANALYSIS_HOLD: Cannot execute trade on HOLD signal.", 400)
  }
  if (analysis.confidence < 65) {
    throw new ExpertRouteError(
      ERROR_CODES.ANALYSIS_LOW_CONFIDENCE,
      `ANALYSIS_LOW_CONFIDENCE: ${analysis.confidence}% < 65% threshold.`,
      400
    )
  }
  return analysis
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
