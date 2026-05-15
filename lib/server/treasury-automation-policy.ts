/**
 * Operational guardrails — env-driven automation policy (cron + treasury debits).
 * Corrections remain ledger-based; safe mode avoids silent auto-paths during incidents.
 */

function truthyEnv(v: string | undefined): boolean {
  const s = String(v ?? "").trim().toLowerCase()
  return s === "1" || s === "true" || s === "yes" || s === "on"
}

/** When set, cron-based crypto verification should not finalize credits automatically. */
export function treasuryCryptoCronSafeModeEnabled(): boolean {
  return truthyEnv(process.env.TREASURY_AUTOMATION_SAFE_MODE ?? process.env.CRYPTO_CRON_SAFE_MODE)
}

/** Pause chain polling / outbound verification work (cron short-circuit). */
export function cryptoCronPausedGlobally(): boolean {
  return truthyEnv(process.env.CRYPTO_CRON_PAUSED ?? process.env.CRYPTO_VERIFICATION_PAUSED)
}

/** Optional MAIN_TREASURY floor below which reconciliation flags high severity (analytics only unless paired with safe mode). */
export function treasuryMainLowWaterUsd(): number | null {
  const n = Number(process.env.TREASURY_MAIN_LOW_WATER_USD ?? "")
  if (!Number.isFinite(n) || n < 0) return null
  return n
}

/** When set (0–100), funding L5 PATCH approve rejects if structured risk score is >= threshold. */
export function fundingRiskScoreBlockThreshold(): number | null {
  const n = Number(process.env.FUNDING_RISK_SCORE_BLOCK_MIN ?? "")
  if (!Number.isFinite(n) || n <= 0 || n > 100) return null
  return Math.floor(n)
}
