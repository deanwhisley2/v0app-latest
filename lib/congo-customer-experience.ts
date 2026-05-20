/**
 * Congo (DRC) customer experience — language, locale, currency, assistant doctrine.
 * Ledger stays USD-normalized; customers see CDF and corridor-appropriate copy.
 */
import type { SupabaseClient } from "@supabase/supabase-js"
import { displayCurrencyForCustomer } from "@/lib/customer-display-currency"
import {
  CONGO_COUNTRY_ISO2,
  isCongoOperatingCountry,
  localeForCustomerCorridor,
} from "@/lib/customer-corridor-money"
import { resolveCustomerAppLanguage } from "@/lib/server/customer-ui-language"
import type { AppLanguage } from "@/lib/user-preferences"

export { CONGO_COUNTRY_ISO2, isCongoOperatingCountry }

export type CustomerExperienceProfile = {
  language: AppLanguage
  fundingCountryCode: string | null
  currency: string
  locale: string
  isCongo: boolean
}

export function localeForCustomerExperience(
  fundingCountryCode: string | null | undefined,
  language: AppLanguage,
): string {
  return localeForCustomerCorridor(fundingCountryCode, language)
}

/** Congo + French → full French UX; Congo + English → English UI, CDF amounts only. */
export function congoAssistantLanguageDirective(
  profile: Pick<CustomerExperienceProfile, "isCongo" | "language" | "currency">,
): string {
  if (!profile.isCongo) return ""
  if (profile.language === "fr") {
    return [
      "Congo (DRC) member — reply in French only.",
      "Format all money in CDF (Congolese franc) using natural French grouping (e.g. 1 519 199,50 CDF).",
      "Never mention UGX, Uganda, or other East Africa corridors.",
      "Tone: clear, professional, trustworthy — not internal ops language.",
    ].join(" ")
  }
  return [
    "Congo (DRC) member — reply in English.",
    `Display money in ${profile.currency} (CDF) only — never UGX or other foreign tickers.`,
    "Never mention Uganda or internal treasury conversion mechanics.",
  ].join(" ")
}

export async function resolveCustomerExperience(
  admin: SupabaseClient,
  userId: string,
): Promise<CustomerExperienceProfile> {
  const language = await resolveCustomerAppLanguage(admin, userId)
  const { data: profile } = await admin
    .from("profiles")
    .select("funding_country_code")
    .eq("id", userId)
    .maybeSingle()
  const fundingCountryCode =
    (profile as { funding_country_code?: string | null } | null)?.funding_country_code?.trim()
      .toUpperCase()
      .slice(0, 2) ?? null
  const currency = displayCurrencyForCustomer(fundingCountryCode, null)
  const locale = localeForCustomerExperience(fundingCountryCode, language)
  return {
    language,
    fundingCountryCode,
    currency,
    locale,
    isCongo: isCongoOperatingCountry(fundingCountryCode),
  }
}
