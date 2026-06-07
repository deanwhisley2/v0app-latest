import type { SupabaseClient } from "@supabase/supabase-js"
import { resolvePaymentRouteForNetwork } from "@/lib/payment-route-resolution"
import {
  ESKNEXUSPRO_AIRTEL_MERCHANT_ID,
  ESKNEXUSPRO_AIRTEL_MERCHANT_NAME,
  ESKNEXUSPRO_MTN_MSISDN,
  ESKNEXUSPRO_MTN_USSD_PREFIX,
  ESKNEXUSPRO_REGISTERED_PAYEE,
  UGANDA_AIRTEL_MERCHANT_ID,
  UGANDA_AIRTEL_MERCHANT_NAME,
  UGANDA_AIRTEL_USSD_PREFIX,
} from "@/lib/server/admin-payment-config"
import { ESK_NEXUSPRO_EMAIL_LOCAL } from "@/lib/server/esk-retailer-identity"
import { eskNexusProMtnFallback } from "@/lib/retailer-payment-templates"

export type UgDepositReceiveRoute = {
  network: "MTN" | "Airtel"
  account: string
  name: string
  accountLabel: string
  ussdPrefix: string | null
  source: "database" | "fallback"
}

function routeFromResolution(
  network: "MTN" | "Airtel",
  paymentNumbers: unknown,
  registeredPayeeNames: string | null,
): UgDepositReceiveRoute | null {
  const resolved = resolvePaymentRouteForNetwork(
    paymentNumbers,
    network,
    registeredPayeeNames,
  )
  if (!resolved?.valid || !resolved.payeeNumberOrMerchantId) return null
  return {
    network,
    account: resolved.payeeNumberOrMerchantId,
    name: resolved.registeredPayeeName,
    accountLabel: network === "MTN" ? "MTN Account" : "Airtel Merchant ID",
    ussdPrefix: resolved.ussdPrefix,
    source: "database",
  }
}

function mtnFallback(): UgDepositReceiveRoute {
  const fb = eskNexusProMtnFallback()
  return {
    network: "MTN",
    account: fb.msisdn || ESKNEXUSPRO_MTN_MSISDN,
    name: fb.payeeName || ESKNEXUSPRO_REGISTERED_PAYEE,
    accountLabel: "MTN Account",
    ussdPrefix: fb.ussdPrefix || ESKNEXUSPRO_MTN_USSD_PREFIX,
    source: "fallback",
  }
}

function airtelFallback(preferRetailerDesk: boolean): UgDepositReceiveRoute {
  if (preferRetailerDesk) {
    return {
      network: "Airtel",
      account: ESKNEXUSPRO_AIRTEL_MERCHANT_ID,
      name: ESKNEXUSPRO_AIRTEL_MERCHANT_NAME,
      accountLabel: "Airtel Merchant ID",
      ussdPrefix: UGANDA_AIRTEL_USSD_PREFIX,
      source: "fallback",
    }
  }
  return {
    network: "Airtel",
    account: UGANDA_AIRTEL_MERCHANT_ID,
    name: UGANDA_AIRTEL_MERCHANT_NAME,
    accountLabel: "Airtel Merchant ID",
    ussdPrefix: UGANDA_AIRTEL_USSD_PREFIX,
    source: "fallback",
  }
}

/** Authoritative Uganda MoMo receive lines for the deposit wizard (DB-first, ESK desk). */
export async function loadUgAuthoritativeDepositRoutes(
  admin: SupabaseClient,
): Promise<{ MTN: UgDepositReceiveRoute; Airtel: UgDepositReceiveRoute }> {
  let paymentNumbers: unknown = null
  let registeredPayeeNames: string | null = null

  const { data: profiles } = await admin
    .from("profiles")
    .select("id,email")
    .ilike("email", `${ESK_NEXUSPRO_EMAIL_LOCAL}@%`)
    .limit(1)

  const eskUserId = profiles?.[0]?.id
  if (eskUserId) {
    const { data: rp } = await admin
      .from("retailer_profiles")
      .select("id,payment_numbers,registered_payee_names")
      .eq("user_id", eskUserId)
      .maybeSingle()

    if (rp) {
      paymentNumbers = rp.payment_numbers
      registeredPayeeNames =
        typeof rp.registered_payee_names === "string" ? rp.registered_payee_names : null

      const { data: corridor } = await admin
        .from("retailer_corridor_desks")
        .select("payment_numbers,registered_payee_names")
        .eq("retailer_profile_id", rp.id)
        .eq("country_code", "UG")
        .eq("active", true)
        .maybeSingle()

      if (corridor?.payment_numbers) {
        paymentNumbers = corridor.payment_numbers
        registeredPayeeNames =
          typeof corridor.registered_payee_names === "string"
            ? corridor.registered_payee_names
            : registeredPayeeNames
      }
    }
  }

  const mtn =
    paymentNumbers != null
      ? routeFromResolution("MTN", paymentNumbers, registeredPayeeNames) ?? mtnFallback()
      : mtnFallback()

  const airtel =
    paymentNumbers != null
      ? routeFromResolution("Airtel", paymentNumbers, registeredPayeeNames) ??
        airtelFallback(true)
      : airtelFallback(true)

  return { MTN: mtn, Airtel: airtel }
}
