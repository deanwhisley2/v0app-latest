/**
 * FAST mode: short TTL (default 60s, within 30–120s band).
 * Override with `NEXUS_FAST_ANALYSIS_TTL_SECONDS` (integer, clamped 30–120).
 * Wider upper bound is intended for controlled live connectivity tests.
 */
export function fastModeTtlSeconds(): number {
  const raw = process.env.NEXUS_FAST_ANALYSIS_TTL_SECONDS?.trim()
  if (raw && /^\d+$/.test(raw)) {
    const n = Number.parseInt(raw, 10)
    return Math.min(120, Math.max(30, n))
  }
  return 60
}

/**
 * TTL for trading eligibility after analysis completes.
 * FAST: short window — signals age quickly (see fastModeTtlSeconds).
 * DEEP: at least the analysis wall-clock window (timeWindowSeconds).
 */
export function computeAnalysisTtlSeconds(params: {
  mode?: "FAST" | "DEEP"
  /** User-selected window in seconds (60–600 for Expert analyze). */
  timeWindowSeconds: number
}): number {
  if (params.mode === "FAST") return fastModeTtlSeconds()
  return Math.max(60, Math.floor(params.timeWindowSeconds))
}
