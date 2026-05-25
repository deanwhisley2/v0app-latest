import type { SupabaseClient } from "@supabase/supabase-js"
import { isSupportedOperatingCountry, operatingCountryByCode } from "@/lib/operating-countries"
import {
  detectCountryFromRequest,
  getEdgeCountryCode,
  getRequestIpAddress,
  shouldBypassCountryCorridor,
} from "@/lib/server/request-geo"

export type CountryCorridorAction = "register" | "send_verification" | "verify_code"

export type CountryCorridorResult =
  | {
      ok: true
      selectedCountry: string
      detectedCountry: string | null
      bypassed: boolean
      geoUncertain?: boolean
      warning?: string
    }
  | {
      ok: false
      blocked: true
      selectedCountry: string
      detectedCountry: string | null
      message: string
    }

export const COUNTRY_CORRIDOR_MISMATCH_MESSAGE =
  "Your connection location may not match the country you selected. Confirm your operating country is correct before continuing."

export const COUNTRY_CORRIDOR_REQUIRED_MESSAGE =
  "Select your operating country before continuing."

export const COUNTRY_CORRIDOR_UNSUPPORTED_MESSAGE =
  "This country is not supported on Nexus Pro yet."

export const COUNTRY_CORRIDOR_UNKNOWN_IP_MESSAGE =
  "We could not verify your connection region from IP alone. Confirm your operating country — mobile carrier networks sometimes route through other regions."

export const COUNTRY_CORRIDOR_MISMATCH_SOFT_WARNING =
  "Connection region lookup differs from your selected country. If you are signing up from your home country (e.g. on Safaricom or Airtel mobile data), you can continue after confirming your selection."

export async function enforceCountryCorridor(
  request: Request,
  selectedCountryCode: string | null | undefined,
): Promise<CountryCorridorResult> {
  const selected = selectedCountryCode?.trim().toUpperCase().slice(0, 2) ?? ""
  if (!isSupportedOperatingCountry(selected)) {
    return {
      ok: false,
      blocked: true,
      selectedCountry: selected,
      detectedCountry: null,
      message: COUNTRY_CORRIDOR_UNSUPPORTED_MESSAGE,
    }
  }

  const ip = getRequestIpAddress(request)
  if (shouldBypassCountryCorridor(ip)) {
    return { ok: true, selectedCountry: selected, detectedCountry: null, bypassed: true }
  }

  const edgeCountry = getEdgeCountryCode(request)
  const detected = edgeCountry ?? (ip ? await detectCountryFromRequest(request) : null)

  if (!detected) {
    return {
      ok: true,
      selectedCountry: selected,
      detectedCountry: null,
      bypassed: true,
      geoUncertain: true,
      warning: COUNTRY_CORRIDOR_UNKNOWN_IP_MESSAGE,
    }
  }

  if (detected !== selected) {
    const label = operatingCountryByCode(selected)?.label ?? selected
    return {
      ok: true,
      selectedCountry: selected,
      detectedCountry: detected,
      bypassed: false,
      geoUncertain: true,
      warning: `${COUNTRY_CORRIDOR_MISMATCH_SOFT_WARNING} (selected: ${label}, network hint: ${detected}).`,
    }
  }

  return { ok: true, selectedCountry: selected, detectedCountry: detected, bypassed: false }
}

export async function recordSignupCorridorEvent(
  admin: SupabaseClient,
  params: {
    action: CountryCorridorAction
    selectedCountry: string
    detectedCountry: string | null
    ipAddress: string | null
    blocked: boolean
    userId?: string | null
    email?: string | null
    userAgent?: string | null
    detail?: string | null
  },
): Promise<void> {
  const email = params.email?.trim().toLowerCase() ?? ""
  const domain = email.includes("@") ? email.split("@")[1]?.slice(0, 120) ?? null : null
  const { error } = await admin.from("signup_corridor_events").insert({
    user_id: params.userId ?? null,
    email_domain: domain,
    action: params.action,
    selected_country: params.selectedCountry.slice(0, 2),
    detected_country: params.detectedCountry?.slice(0, 2) ?? null,
    ip_address: params.ipAddress,
    blocked: params.blocked,
    user_agent: params.userAgent?.slice(0, 500) ?? null,
    detail: params.detail?.slice(0, 500) ?? null,
  })
  if (error) {
    console.warn("[signup-corridor]", error.message)
  }
}
