/**
 * Customer corridor experience — language, locale, currency, assistant doctrine.
 * DRC (CD/CDF) and Congo Brazzaville (CG/XAF) share French formatting; ledger stays USD-normalized.
 */
import type { SupabaseClient } from "@supabase/supabase-js"
import { displayCurrencyForCustomer } from "@/lib/customer-display-currency"
import {
  CONGO_BRAZZAVILLE_COUNTRY_ISO2,
  CONGO_COUNTRY_ISO2,
  CONGO_DRC_COUNTRY_ISO2,
  isCentralAfricaLocalizedCorridor,
  isCongoBrazzavilleOperatingCountry,
  isCongoOperatingCountry,
  isDrcOperatingCountry,
  localeForCustomerCorridor,
} from "@/lib/customer-corridor-money"
import { resolveCustomerAppLanguage } from "@/lib/server/customer-ui-language"
import type { AppLanguage } from "@/lib/user-preferences"

export {
  CONGO_BRAZZAVILLE_COUNTRY_ISO2,
  CONGO_COUNTRY_ISO2,
  CONGO_DRC_COUNTRY_ISO2,
  isCentralAfricaLocalizedCorridor,
  isCongoBrazzavilleOperatingCountry,
  isCongoOperatingCountry,
  isDrcOperatingCountry,
}

export type CustomerExperienceProfile = {
  language: AppLanguage
  fundingCountryCode: string | null
  currency: string
  locale: string
  /** DRC (CD) — CDF corridor. */
  isCongo: boolean
  /** Republic of the Congo / Brazzaville (CG) — XAF corridor. */
  isCongoBrazzaville: boolean
}

export function localeForCustomerExperience(
  fundingCountryCode: string | null | undefined,
  language: AppLanguage,
): string {
  return localeForCustomerCorridor(fundingCountryCode, language)
}

import { operatingCountryByCode } from "@/lib/operating-countries"

/** Regional assistant rules: corridor currency + language; never expose other corridors. */
export function corridorAssistantLanguageDirective(
  profile: Pick<
    CustomerExperienceProfile,
    "isCongo" | "isCongoBrazzaville" | "language" | "currency" | "fundingCountryCode"
  >,
): string {
  const country = profile.fundingCountryCode?.trim().toUpperCase().slice(0, 2) ?? ""
  const row = operatingCountryByCode(country)
  if (!row) return ""

  const langLabel = profile.language === "fr" ? "French" : profile.language === "en" ? "English" : profile.language
  const lines: string[] = [
    `Member country: ${row.label} (${row.currency}).`,
    profile.language === row.language
      ? `Reply in ${langLabel} only.`
      : `UI language is ${langLabel}; still use ${row.currency} for all money amounts.`,
    `Format every amount in ${profile.currency} using natural local separators — never USD, never foreign tickers.`,
    "Never mention internal conversion, treasury, or other countries' currencies.",
    "Tone: short, professional, business-like.",
  ]

  if (profile.isCongo && profile.language === "fr") {
    lines.push("Example amount style: 1 519 199,50 CDF.")
  } else if (profile.isCongoBrazzaville && profile.language === "fr") {
    lines.push("Example amount style: 150 000 CFA (XAF) or 1 500 000,00 XAF.")
  } else if (profile.currency === "XAF" && profile.language === "fr") {
    lines.push("Example amount style: 150 000 XAF (CFA).")
  }
  return lines.join(" ")
}

/** @deprecated Use corridorAssistantLanguageDirective */
export function congoAssistantLanguageDirective(
  profile: Pick<
    CustomerExperienceProfile,
    "isCongo" | "isCongoBrazzaville" | "language" | "currency" | "fundingCountryCode"
  >,
): string {
  const cc = profile.fundingCountryCode ?? (profile.isCongo ? "CD" : profile.isCongoBrazzaville ? "CG" : null)
  return corridorAssistantLanguageDirective({ ...profile, fundingCountryCode: cc })
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
    isCongo: isDrcOperatingCountry(fundingCountryCode),
    isCongoBrazzaville: isCongoBrazzavilleOperatingCountry(fundingCountryCode),
  }
}
