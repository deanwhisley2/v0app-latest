import type { SupabaseClient } from "@supabase/supabase-js"
import { formatMoneyAmount } from "@/lib/currency-display"
import { displayCurrencyForCustomer } from "@/lib/customer-display-currency"

export async function resolveCustomerDisplayCurrency(
  sb: SupabaseClient,
  userId: string,
  preferredCurrencyFromMeta?: string | null,
): Promise<string> {
  const { data: profile } = await sb
    .from("profiles")
    .select("funding_country_code")
    .eq("id", userId)
    .maybeSingle()
  const country = (profile as { funding_country_code?: string | null } | null)?.funding_country_code
  return displayCurrencyForCustomer(country, preferredCurrencyFromMeta ?? null)
}

export function formatCustomerMoneyCopy(
  amountUsd: number,
  currency: string,
  locale = "en-US",
): string {
  return formatMoneyAmount(amountUsd, currency, locale)
}

export async function formatCustomerMoneyForUser(
  sb: SupabaseClient,
  userId: string,
  amountUsd: number,
  preferredCurrencyFromMeta?: string | null,
): Promise<string> {
  const currency = await resolveCustomerDisplayCurrency(sb, userId, preferredCurrencyFromMeta)
  return formatCustomerMoneyCopy(amountUsd, currency)
}
