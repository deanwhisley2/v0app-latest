import { createAdminClient } from "@/lib/supabaseAdmin"

export interface ConversionRequest {
  amount: number
  fromCurrency: string
  toCurrency: string
}

export interface ConversionResult {
  originalAmount: number
  originalCurrency: string
  convertedAmount: number
  targetCurrency: string
  rateUsed: number
  timestamp: string
  usdIntermediate: boolean
}

function normCurrency(v: string): string {
  return v.trim().toUpperCase()
}

class CurrencyEngine {
  async getRate(fromCurrencyRaw: string, toCurrencyRaw: string): Promise<number> {
    const fromCurrency = normCurrency(fromCurrencyRaw)
    const toCurrency = normCurrency(toCurrencyRaw)
    if (fromCurrency === toCurrency) return 1

    const admin = createAdminClient()
    const { data: direct, error: directErr } = await admin
      .from("fx_rates")
      .select("rate")
      .eq("from_currency", fromCurrency)
      .eq("to_currency", toCurrency)
      .order("effective_from", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (directErr) throw new Error(directErr.message)
    if (direct?.rate !== undefined && direct?.rate !== null) return Number(direct.rate)

    const rateToUsd = await this.getRateToUSD(fromCurrency)
    const rateFromUsd = await this.getRateFromUSD(toCurrency)
    return rateToUsd * rateFromUsd
  }

  private async getRateToUSD(currencyRaw: string): Promise<number> {
    const currency = normCurrency(currencyRaw)
    if (currency === "USD") return 1
    const admin = createAdminClient()

    const { data: direct, error: directErr } = await admin
      .from("fx_rates")
      .select("rate")
      .eq("from_currency", currency)
      .eq("to_currency", "USD")
      .order("effective_from", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (directErr) throw new Error(directErr.message)
    if (direct?.rate !== undefined && direct?.rate !== null) return Number(direct.rate)

    // If only USD->LOCAL exists, invert it.
    const { data: inv, error: invErr } = await admin
      .from("fx_rates")
      .select("rate")
      .eq("from_currency", "USD")
      .eq("to_currency", currency)
      .order("effective_from", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (invErr) throw new Error(invErr.message)
    if (!inv?.rate) throw new Error(`Missing FX rate for ${currency}<->USD`)
    const r = Number(inv.rate)
    if (r <= 0) throw new Error(`Invalid FX rate for USD->${currency}`)
    return 1 / r
  }

  private async getRateFromUSD(currencyRaw: string): Promise<number> {
    const currency = normCurrency(currencyRaw)
    if (currency === "USD") return 1
    const admin = createAdminClient()

    const { data: direct, error: directErr } = await admin
      .from("fx_rates")
      .select("rate")
      .eq("from_currency", "USD")
      .eq("to_currency", currency)
      .order("effective_from", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (directErr) throw new Error(directErr.message)
    if (direct?.rate !== undefined && direct?.rate !== null) return Number(direct.rate)

    // If only LOCAL->USD exists, invert it.
    const { data: inv, error: invErr } = await admin
      .from("fx_rates")
      .select("rate")
      .eq("from_currency", currency)
      .eq("to_currency", "USD")
      .order("effective_from", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (invErr) throw new Error(invErr.message)
    if (!inv?.rate) throw new Error(`Missing FX rate for USD<->${currency}`)
    const r = Number(inv.rate)
    if (r <= 0) throw new Error(`Invalid FX rate for ${currency}->USD`)
    return 1 / r
  }

  async convert(request: ConversionRequest): Promise<ConversionResult> {
    const fromCurrency = normCurrency(request.fromCurrency)
    const toCurrency = normCurrency(request.toCurrency)
    const rate = await this.getRate(fromCurrency, toCurrency)
    const convertedAmount = request.amount * rate
    return {
      originalAmount: request.amount,
      originalCurrency: fromCurrency,
      convertedAmount,
      targetCurrency: toCurrency,
      rateUsed: rate,
      timestamp: new Date().toISOString(),
      usdIntermediate: fromCurrency !== "USD" && toCurrency !== "USD",
    }
  }

  async toUSD(amount: number, fromCurrency: string): Promise<number> {
    const out = await this.convert({ amount, fromCurrency, toCurrency: "USD" })
    return out.convertedAmount
  }

  async toLocal(amountUsd: number, localCurrency: string): Promise<number> {
    const out = await this.convert({ amount: amountUsd, fromCurrency: "USD", toCurrency: localCurrency })
    return out.convertedAmount
  }

  formatForUser(amount: number, currencyRaw: string): string {
    const currency = normCurrency(currencyRaw)
    try {
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency,
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      }).format(amount)
    } catch {
      return `${currency} ${amount.toFixed(2)}`
    }
  }

  async getUserCurrency(userId: string): Promise<string> {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from("profiles")
      .select("funding_country_code")
      .eq("id", userId)
      .maybeSingle()
    if (error) throw new Error(error.message)
    const row = data as { funding_country_code?: string | null } | null
    const country = row?.funding_country_code?.trim().toUpperCase()
    if (country === "KE") return "KES"
    if (country === "UG") return "UGX"
    return "UGX"
  }
}

export const currencyEngine = new CurrencyEngine()

