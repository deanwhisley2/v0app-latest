import type { SupabaseClient } from "@supabase/supabase-js"
import { operatingCountryByCode } from "@/lib/operating-countries"
import { translateApp } from "@/lib/i18n/app-messages"
import type { AppLanguage } from "@/lib/user-preferences"

/** Resolve UI language for server-written customer notifications (profile corridor). */
export async function resolveCustomerAppLanguage(
  admin: SupabaseClient,
  userId: string,
): Promise<AppLanguage> {
  const { data: authUser } = await admin.auth.admin.getUserById(userId).catch(() => ({ data: { user: null } }))
  const meta = authUser?.user?.user_metadata as Record<string, unknown> | undefined
  const pref = meta?.preferred_language ?? meta?.preferredLanguage
  if (typeof pref === "string" && pref.length >= 2) {
    const code = pref.trim().toLowerCase() as AppLanguage
    if (["en", "fr", "sw", "ar", "pt", "ha", "am", "zu", "wo"].includes(code)) {
      return code
    }
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("funding_country_code")
    .eq("id", userId)
    .maybeSingle()
  const country = (profile as { funding_country_code?: string | null } | null)?.funding_country_code
  const cc = country?.trim().toUpperCase().slice(0, 2) ?? ""
  if (cc === "KE") return "en"
  return operatingCountryByCode(country)?.language ?? "en"
}

export function customerNotifyT(lang: AppLanguage): (key: string) => string {
  return (key: string) => translateApp(lang, key)
}

/** Resolve language + translator for server-written inbox rows (funding, trade, security). */
export async function customerNotifyForUser(
  admin: SupabaseClient,
  userId: string,
): Promise<{ language: AppLanguage; t: ReturnType<typeof customerNotifyT> }> {
  const language = await resolveCustomerAppLanguage(admin, userId)
  return { language, t: customerNotifyT(language) }
}
