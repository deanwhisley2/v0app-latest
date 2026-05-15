import type { SupabaseClient } from "@supabase/supabase-js"
import { USD_TO_FX, isSupportedFiat, type FiatCurrencyCode } from "@/lib/currency-display"
import { readFxLocalPerUsdMap } from "@/lib/nexus-fx"
import { roundUsd2 } from "@/lib/nexus-financial-policy"

/** UTC calendar date YYYY-MM-DD for daily rate bucket. */
export function utcRateDateKey(d = new Date()): string {
  return d.toISOString().slice(0, 10)
}

function policyLocalPerUsd(currency: string): number | null {
  const code = currency.trim().toUpperCase()
  if (!isSupportedFiat(code)) return null
  const envMap = readFxLocalPerUsdMap()
  const rate = envMap[code] ?? USD_TO_FX[code as FiatCurrencyCode]
  return rate && rate > 0 ? rate : null
}

/** Stable rate for the UTC day — not intraday spot fluctuation. */
export async function getDailyLocalPerUsd(
  admin: SupabaseClient,
  currencyCode: string,
  at = new Date(),
): Promise<{ localPerUsd: number; rateDate: string }> {
  const currency = currencyCode.trim().toUpperCase()
  const rateDate = utcRateDateKey(at)
  const fallback = policyLocalPerUsd(currency)
  if (!fallback) throw new Error(`Unsupported currency for daily FX: ${currency}`)

  const { data, error } = await admin
    .from("daily_fx_rates")
    .select("local_per_usd")
    .eq("rate_date", rateDate)
    .eq("currency_code", currency)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (data?.local_per_usd) {
    return { localPerUsd: Number(data.local_per_usd), rateDate }
  }

  const { error: insErr } = await admin.from("daily_fx_rates").upsert(
    {
      rate_date: rateDate,
      currency_code: currency,
      local_per_usd: fallback,
      source: "policy_v1",
    },
    { onConflict: "rate_date,currency_code" },
  )
  if (insErr) throw new Error(insErr.message)

  return { localPerUsd: fallback, rateDate }
}

export function localToUsdWithDailyRate(amountLocal: number, localPerUsd: number): number {
  if (!Number.isFinite(amountLocal) || amountLocal <= 0) return 0
  if (!Number.isFinite(localPerUsd) || localPerUsd <= 0) return 0
  return roundUsd2(amountLocal / localPerUsd)
}

export function dailyFxQuoteExpiresAt(rateDate: string): string {
  const d = new Date(`${rateDate}T23:59:59.999Z`)
  return d.toISOString()
}
