/**
 * Dual-currency funding display for ops desk / admin queues.
 * Never format raw `retailer_fund_requests.amount` as USD when a local leg exists.
 */

export type FundingAmountDisplayInput = {
  /** Legacy row amount (USD when FX was applied; may be mis-filed local for old admin_airtel rows). */
  amount?: number | null
  amount_usd_locked?: number | null
  amount_input_local?: number | null
  input_currency?: string | null
  fx_rate_snapshot?: number | null
  l5_settlement_usd?: number | null
  fx_middleware?: Record<string, unknown> | null
}

function num(v: unknown): number {
  const n = Number(v ?? NaN)
  return Number.isFinite(n) ? n : NaN
}

/** Treasury / settlement USD — prefers locked USD, FX middleware, mis-filed-local heuristic. */
export function resolveFundingSettlementUsd(input: FundingAmountDisplayInput): number | null {
  const fx = input.fx_middleware
  const fxNorm = num(fx?.amount_usd_normalized)
  const inputLocal = num(fx?.amount_input_local ?? input.amount_input_local)
  const locked = num(input.amount_usd_locked)
  const legacy = num(input.amount)
  const l5 = num(input.l5_settlement_usd)

  const pick = (v: number) => (Number.isFinite(v) && v > 0 ? v : null)

  if (pick(l5)) return l5!
  if (pick(locked)) {
    if (
      pick(inputLocal) &&
      pick(fxNorm) &&
      fxNorm! < locked! * 0.5 &&
      Math.abs(locked! - inputLocal!) / Math.max(inputLocal!, 1) < 0.02
    ) {
      return fxNorm!
    }
    return locked!
  }
  if (pick(fxNorm)) return fxNorm!
  if (pick(legacy)) return legacy!
  return null
}

export type FundingAmountDisplayLines = {
  primary: string
  secondary: string | null
  settlementUsd: number | null
  localAmount: number | null
  localCurrency: string | null
  localPerUsd: number | null
}

export function formatFundingAmountDisplay(input: FundingAmountDisplayInput): FundingAmountDisplayLines {
  const fx = input.fx_middleware
  const local =
    num(fx?.amount_input_local) > 0
      ? num(fx?.amount_input_local)
      : num(input.amount_input_local) > 0
        ? num(input.amount_input_local)
        : NaN
  const ccy = String(fx?.input_currency ?? input.input_currency ?? "")
    .trim()
    .toUpperCase()
  const lp =
    num(fx?.local_per_usd) > 0
      ? num(fx?.local_per_usd)
      : num(input.fx_rate_snapshot) > 0
        ? num(input.fx_rate_snapshot)
        : NaN
  const settlementUsd = resolveFundingSettlementUsd(input)

  if (Number.isFinite(local) && local > 0 && ccy.length >= 3) {
    const localFmt = `${ccy} ${local.toLocaleString(undefined, {
      maximumFractionDigits: ccy === "UGX" || ccy === "TZS" || ccy === "RWF" || ccy === "MWK" ? 0 : 2,
    })}`
    const usd =
      settlementUsd != null && Number.isFinite(settlementUsd)
        ? `≈ USD ${settlementUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        : null
    const rate =
      Number.isFinite(lp) && lp > 0
        ? `Rate ${lp.toLocaleString(undefined, { maximumFractionDigits: 4 })} ${ccy}/USD`
        : null
    const secondary = [usd, rate].filter(Boolean).join(" · ") || null
    return {
      primary: localFmt,
      secondary,
      settlementUsd,
      localAmount: local,
      localCurrency: ccy,
      localPerUsd: Number.isFinite(lp) ? lp : null,
    }
  }

  if (settlementUsd != null && Number.isFinite(settlementUsd)) {
    return {
      primary: `USD ${settlementUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      secondary: null,
      settlementUsd,
      localAmount: null,
      localCurrency: null,
      localPerUsd: null,
    }
  }

  const legacy = num(input.amount)
  if (Number.isFinite(legacy) && legacy > 0) {
    return {
      primary: `USD ${legacy.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      secondary: "(legacy row — verify FX)",
      settlementUsd: legacy,
      localAmount: null,
      localCurrency: null,
      localPerUsd: null,
    }
  }

  return {
    primary: "—",
    secondary: null,
    settlementUsd: null,
    localAmount: null,
    localCurrency: null,
    localPerUsd: null,
  }
}
