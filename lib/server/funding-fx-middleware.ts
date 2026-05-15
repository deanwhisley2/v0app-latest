import type { SupabaseClient } from "@supabase/supabase-js"
import { getDailyLocalPerUsd, localToUsdWithDailyRate, utcRateDateKey } from "@/lib/server/daily-fx-rate"
import { roundUsd2 } from "@/lib/nexus-financial-policy"
import { isAdminDirectFundChannel } from "@/lib/server/admin-payment-config"
import { isSupportedFiat } from "@/lib/currency-display"
import { auditFundingConversion } from "@/lib/server/funding-math-audit"

/** Released with migrations / notify copy — bump when FX semantics change. */
export const FUNDING_FX_MIDDLEWARE_VERSION = "funding_fx_v1"

/** How the funding request entered the ops stack (not a retailer identity). */
export type FundingFxRoutingLane = "official_corridor" | "retailer_desk" | "admin_direct" | "legacy_admin"

export type FxNormalizeLocalToUsdResult = {
  amountInputLocal: number
  inputCurrency: string
  localPerUsd: number
  rateDate: string
  /** Tagged provider bucket (e.g. internal_daily_fx_rates:policy_v1). */
  rateSourceTag: string
  amountUsdNormalized: number
  audit: ReturnType<typeof auditFundingConversion>
}

/**
 * Server-side local → USD using the same daily bucket as production funding (stable policy / daily_fx_rates).
 */
export async function normalizeLocalAmountToUsd(
  admin: SupabaseClient,
  params: { amountLocal: number; currencyCode: string },
): Promise<FxNormalizeLocalToUsdResult> {
  const cur = params.currencyCode.trim().toUpperCase()
  if (!isSupportedFiat(cur)) throw new Error(`Unsupported currency: ${cur}`)
  if (!Number.isFinite(params.amountLocal) || params.amountLocal <= 0) {
    throw new Error("Local amount must be positive.")
  }
  const daily = await getDailyLocalPerUsd(admin, cur)
  const amountUsdNormalized = localToUsdWithDailyRate(params.amountLocal, daily.localPerUsd)
  const audit = auditFundingConversion({
    amountInputLocal: params.amountLocal,
    inputCurrency: cur,
    fxRateSnapshot: daily.localPerUsd,
    amountUsdLocked: amountUsdNormalized,
  })
  if (!audit.ok) {
    throw new Error(audit.message)
  }
  return {
    amountInputLocal: params.amountLocal,
    inputCurrency: cur,
    localPerUsd: daily.localPerUsd,
    rateDate: daily.rateDate,
    rateSourceTag: `internal_daily_fx_rates:${daily.fxTableSource}`,
    amountUsdNormalized: roundUsd2(amountUsdNormalized),
    audit,
  }
}

export function inferFundingFxRoutingLane(params: {
  fundChannel: string
  retailerId: string | null
  officialCorridorRouteId: string | null
}): FundingFxRoutingLane {
  if (isAdminDirectFundChannel(params.fundChannel)) return "admin_direct"
  if (params.fundChannel === "legacy_admin") return "legacy_admin"
  if (params.officialCorridorRouteId && !params.retailerId) return "official_corridor"
  if (params.retailerId) return "retailer_desk"
  return "official_corridor"
}

/** After L5 approves: USD credited × locked local_per_usd → customer-facing local equivalent (same rate as quote). */
export function usdToLocalEquivalentDisplay(usd: number, localPerUsd: number): number {
  if (!Number.isFinite(usd) || usd <= 0) return 0
  if (!Number.isFinite(localPerUsd) || localPerUsd <= 0) return 0
  return Math.round(usd * localPerUsd * 100) / 100
}

export async function insertFundingFxNormalization(
  admin: SupabaseClient,
  row: {
    fundRequestId: string
    userId: string
    routingLane: FundingFxRoutingLane
    amountInputLocal: number | null
    inputCurrency: string | null
    localPerUsd: number
    rateDate: string
    rateSource?: string
    amountUsdNormalized: number
    rateCapturedAtIso?: string
  },
): Promise<void> {
  const capturedAt = row.rateCapturedAtIso ?? new Date().toISOString()
  const { error } = await admin.from("funding_fx_normalization").insert({
    fund_request_id: row.fundRequestId,
    user_id: row.userId,
    routing_lane: row.routingLane,
    amount_input_local: row.amountInputLocal,
    input_currency: row.inputCurrency,
    local_per_usd: row.localPerUsd,
    rate_date: row.rateDate,
    rate_source: row.rateSource ?? "internal_daily_fx_rates:policy_v1",
    rate_captured_at: capturedAt,
    middleware_version: FUNDING_FX_MIDDLEWARE_VERSION,
    amount_usd_normalized: roundUsd2(row.amountUsdNormalized),
  })
  if (error) throw new Error(error.message)
}

/** Optional row for non-local admin rails (USD-only); keeps a single SSOT for “middleware saw this request”. */
export async function insertFundingFxNormalizationUsdOnly(
  admin: SupabaseClient,
  row: {
    fundRequestId: string
    userId: string
    routingLane: FundingFxRoutingLane
    amountUsdNormalized: number
  },
): Promise<void> {
  const today = utcRateDateKey()
  const capturedAt = new Date().toISOString()
  const { error } = await admin.from("funding_fx_normalization").insert({
    fund_request_id: row.fundRequestId,
    user_id: row.userId,
    routing_lane: row.routingLane,
    amount_input_local: null,
    input_currency: null,
    local_per_usd: 1,
    rate_date: today,
    rate_source: "usd_native_v1",
    rate_captured_at: capturedAt,
    middleware_version: FUNDING_FX_MIDDLEWARE_VERSION,
    amount_usd_normalized: roundUsd2(row.amountUsdNormalized),
  })
  if (error) throw new Error(error.message)
}

export async function finalizeFundingFxOnApproval(
  admin: SupabaseClient,
  params: {
    fundRequestId: string
    settledAmountUsd: number
    settledByUserId: string
  },
): Promise<void> {
  const { data: row, error: selErr } = await admin
    .from("funding_fx_normalization")
    .select("id, local_per_usd, input_currency, rate_source")
    .eq("fund_request_id", params.fundRequestId)
    .maybeSingle()
  if (selErr) throw new Error(selErr.message)
  if (!row) return

  const localPer = Number((row as { local_per_usd?: unknown }).local_per_usd ?? 1)
  const rateSource = String((row as { rate_source?: string }).rate_source ?? "")
  const settledUsd = roundUsd2(params.settledAmountUsd)
  const settledLocal =
    rateSource === "usd_native_v1" || !Number.isFinite(localPer) || localPer <= 0
      ? null
      : usdToLocalEquivalentDisplay(settledUsd, localPer)
  const { error: upErr } = await admin
    .from("funding_fx_normalization")
    .update({
      settled_amount_usd: settledUsd,
      settled_local_equivalent: settledLocal,
      settled_at: new Date().toISOString(),
      settled_by: params.settledByUserId,
    })
    .eq("id", (row as { id: string }).id)
  if (upErr) throw new Error(upErr.message)
}

export async function getFundingFxSnapshotByRequestId(
  admin: SupabaseClient,
  fundRequestId: string,
): Promise<Record<string, unknown> | null> {
  const { data, error } = await admin
    .from("funding_fx_normalization")
    .select(
      "id,fund_request_id,routing_lane,amount_input_local,input_currency,local_per_usd,rate_date,rate_source,rate_captured_at,middleware_version,amount_usd_normalized,settled_amount_usd,settled_local_equivalent,settled_at,settled_by,created_at",
    )
    .eq("fund_request_id", fundRequestId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return (data ?? null) as Record<string, unknown> | null
}
