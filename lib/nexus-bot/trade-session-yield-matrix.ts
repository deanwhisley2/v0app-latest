/** Company monthly stop-loss: static 30-day morning/evening yield matrix (server + admin UI). */

export const TRADE_SESSION_YIELD_MATRIX_SOURCE = "static_yield_matrix_v1" as const
export const TRADE_SESSION_YIELD_MATRIX_DAYS = 30
export const TRADE_SESSION_YIELD_MATRIX_MONTHLY_MIN_PCT = 21
export const TRADE_SESSION_YIELD_MATRIX_MONTHLY_MAX_PCT = 28

export type YieldMatrixDay = {
  morningPercent: number
  eveningPercent: number
}

/**
 * Hardcoded 30-day matrix. Days 1–5 match spec; days 6–30 complete the cycle.
 * Sum of all 60 slots ≈ 24.78329% (within 21–28% treasury cap).
 */
export const TRADE_SESSION_YIELD_MATRIX_30D: readonly YieldMatrixDay[] = [
  { morningPercent: 0.45, eveningPercent: 0.28333 },
  { morningPercent: 0.6, eveningPercent: 0.23333 },
  { morningPercent: 0.25, eveningPercent: 0.45 },
  { morningPercent: 0.55, eveningPercent: 0.35 },
  { morningPercent: 0.7, eveningPercent: 0.23333 },
  { morningPercent: 0.4, eveningPercent: 0.35 },
  { morningPercent: 0.5, eveningPercent: 0.3 },
  { morningPercent: 0.35, eveningPercent: 0.4 },
  { morningPercent: 0.55, eveningPercent: 0.28333 },
  { morningPercent: 0.45, eveningPercent: 0.35 },
  { morningPercent: 0.3, eveningPercent: 0.5 },
  { morningPercent: 0.65, eveningPercent: 0.23333 },
  { morningPercent: 0.4, eveningPercent: 0.38333 },
  { morningPercent: 0.5, eveningPercent: 0.33333 },
  { morningPercent: 0.55, eveningPercent: 0.25 },
  { morningPercent: 0.35, eveningPercent: 0.45 },
  { morningPercent: 0.6, eveningPercent: 0.28333 },
  { morningPercent: 0.45, eveningPercent: 0.38333 },
  { morningPercent: 0.25, eveningPercent: 0.53333 },
  { morningPercent: 0.7, eveningPercent: 0.23333 },
  { morningPercent: 0.4, eveningPercent: 0.41667 },
  { morningPercent: 0.55, eveningPercent: 0.3 },
  { morningPercent: 0.35, eveningPercent: 0.46667 },
  { morningPercent: 0.5, eveningPercent: 0.35 },
  { morningPercent: 0.45, eveningPercent: 0.38333 },
  { morningPercent: 0.6, eveningPercent: 0.23333 },
  { morningPercent: 0.3, eveningPercent: 0.51667 },
  { morningPercent: 0.55, eveningPercent: 0.28333 },
  { morningPercent: 0.4, eveningPercent: 0.43333 },
  { morningPercent: 0.65, eveningPercent: 0.28333 },
] as const

function roundPct5(n: number): number {
  return Math.round(n * 100_000) / 100_000
}

export function sumYieldMatrixTotalPercent(matrix = TRADE_SESSION_YIELD_MATRIX_30D): number {
  let sum = 0
  for (const day of matrix) {
    sum += day.morningPercent + day.eveningPercent
  }
  return roundPct5(sum)
}

export function assertYieldMatrixMonthlyCap(matrix = TRADE_SESSION_YIELD_MATRIX_30D): void {
  if (matrix.length !== TRADE_SESSION_YIELD_MATRIX_DAYS) {
    throw new Error(`YIELD_MATRIX_DAY_COUNT_INVALID:${matrix.length}`)
  }
  const total = sumYieldMatrixTotalPercent(matrix)
  if (total < TRADE_SESSION_YIELD_MATRIX_MONTHLY_MIN_PCT - 0.0001) {
    throw new Error(`YIELD_MATRIX_BELOW_MIN:${total}`)
  }
  if (total > TRADE_SESSION_YIELD_MATRIX_MONTHLY_MAX_PCT + 0.0001) {
    throw new Error(`YIELD_MATRIX_ABOVE_MAX:${total}`)
  }
}

/** UTC calendar day-of-month wrapped onto the 30-day matrix (0–29, day 31 → index 0). */
export function yieldMatrixDayIndex(sessionStartAt: Date | string): number {
  const d = sessionStartAt instanceof Date ? sessionStartAt : new Date(sessionStartAt)
  const y = d.getUTCFullYear()
  const m = d.getUTCMonth()
  const monthStart = Date.UTC(y, m, 1)
  const calendarDay = Math.floor((d.getTime() - monthStart) / 86_400_000)
  const wrapped = ((calendarDay % TRADE_SESSION_YIELD_MATRIX_DAYS) + TRADE_SESSION_YIELD_MATRIX_DAYS) %
    TRADE_SESSION_YIELD_MATRIX_DAYS
  return wrapped
}

export function normalizeYieldMatrixSlot(raw: string): "morning" | "evening" {
  return String(raw).toLowerCase() === "evening" ? "evening" : "morning"
}

export function getYieldMatrixDayRates(
  dayIndex: number,
  matrix = TRADE_SESSION_YIELD_MATRIX_30D,
): { morningPercent: number; eveningPercent: number; dailyPercent: number } {
  const wrapped =
    ((dayIndex % TRADE_SESSION_YIELD_MATRIX_DAYS) + TRADE_SESSION_YIELD_MATRIX_DAYS) %
    TRADE_SESSION_YIELD_MATRIX_DAYS
  const day = matrix[wrapped]!
  const morningPercent = roundPct5(day.morningPercent)
  const eveningPercent = roundPct5(day.eveningPercent)
  return {
    morningPercent,
    eveningPercent,
    dailyPercent: roundPct5(morningPercent + eveningPercent),
  }
}

/** Matrix slot % for trade_sessions.max_yield_percent at registration. */
export function resolveMatrixYieldPercent(
  sessionStartAt: Date | string,
  sessionSlot: string,
  matrix = TRADE_SESSION_YIELD_MATRIX_30D,
): number {
  const dayIndex = yieldMatrixDayIndex(sessionStartAt)
  const rates = getYieldMatrixDayRates(dayIndex, matrix)
  const slot = normalizeYieldMatrixSlot(sessionSlot)
  return slot === "evening" ? rates.eveningPercent : rates.morningPercent
}

assertYieldMatrixMonthlyCap()
