import {
  ESKNEXUSPRO_KE_MPESA_LINES,
  ESKNEXUSPRO_KE_MPESA_USSD_PREFIX,
  ESKNEXUSPRO_MTN_MSISDN,
  ESKNEXUSPRO_MTN_USSD_PREFIX,
  ESKNEXUSPRO_PAYEE_BRAND,
  ESKNEXUSPRO_REGISTERED_PAYEE,
} from "@/lib/server/admin-payment-config"

export type RetailerPaymentLine = {
  label?: string
  value?: string
  payment_type?: string
  merchant_id?: string
  merchant_name?: string
  /** Per-route registered payee (independent from other networks on the same desk). */
  payee_name?: string
  ussd_prefix?: string
}

export type UgAirtelMerchantTemplate = {
  kind: "ug_airtel_merchant"
  merchantId: string
  merchantName: string
  payeeName: string
  ussdPrefix: string
}

export type UgMtnMobileTemplate = {
  kind: "ug_mtn_mobile"
  msisdn: string
  payeeName: string
  payeeBrand: string
  ussdPrefix: string
}

export type KeMpesaReceiveLine = {
  payeeName: string
  msisdn: string
}

export type KeMpesaMobileTemplate = {
  kind: "ke_mpesa_mobile"
  ussdPrefix: string
  lines: KeMpesaReceiveLine[]
}

const DEFAULT_AIRTEL_USSD = "*185*9#"
const DEFAULT_AIRTEL_MERCHANT_NAME = "Nexus Pro2"

export function parseUgAirtelMerchantDesk(
  paymentNumbers: unknown,
  _registeredPayeeNames?: string | null | undefined,
): UgAirtelMerchantTemplate | null {
  const rows = Array.isArray(paymentNumbers) ? (paymentNumbers as RetailerPaymentLine[]) : []
  for (const row of rows) {
    const pt = String(row.payment_type ?? "").toLowerCase()
    const lab = String(row.label ?? "").toLowerCase()
    if (pt === "airtel_merchant_ug" || lab.includes("airtel")) {
      const merchantId = String(row.merchant_id ?? row.value ?? "").trim()
      if (merchantId) {
        const merchantName = String(row.merchant_name ?? DEFAULT_AIRTEL_MERCHANT_NAME).trim()
        const payeeName = String(row.payee_name ?? merchantName).trim() || merchantName
        return {
          kind: "ug_airtel_merchant",
          merchantId,
          merchantName,
          payeeName,
          ussdPrefix: String(row.ussd_prefix ?? DEFAULT_AIRTEL_USSD).trim() || DEFAULT_AIRTEL_USSD,
        }
      }
    }
  }
  return null
}

export function parseUgMtnMobileDesk(
  paymentNumbers: unknown,
  registeredPayeeNames: string | null | undefined,
): UgMtnMobileTemplate | null {
  const rows = Array.isArray(paymentNumbers) ? (paymentNumbers as RetailerPaymentLine[]) : []
  for (const row of rows) {
    const pt = String(row.payment_type ?? "").toLowerCase()
    const lab = String(row.label ?? "").toLowerCase()
    if (pt === "mtn_mobile_ug" || lab.includes("mtn")) {
      const msisdn = String(row.value ?? "").trim()
      if (msisdn) {
        const linePayee = String(row.payee_name ?? "").trim()
        const deskPayee = String(registeredPayeeNames ?? "").trim()
        return {
          kind: "ug_mtn_mobile",
          msisdn,
          payeeName: linePayee || deskPayee || ESKNEXUSPRO_REGISTERED_PAYEE,
          payeeBrand: ESKNEXUSPRO_PAYEE_BRAND,
          ussdPrefix: String(row.ussd_prefix ?? ESKNEXUSPRO_MTN_USSD_PREFIX).trim() || ESKNEXUSPRO_MTN_USSD_PREFIX,
        }
      }
    }
  }
  return null
}

export function parseKeMpesaMobileDesk(paymentNumbers: unknown): KeMpesaMobileTemplate | null {
  const rows = Array.isArray(paymentNumbers) ? (paymentNumbers as RetailerPaymentLine[]) : []
  const lines: KeMpesaReceiveLine[] = []
  for (const row of rows) {
    const pt = String(row.payment_type ?? "").toLowerCase()
    const lab = String(row.label ?? "").toLowerCase()
    if (pt !== "mpesa_mobile_ke" && !lab.includes("mpesa")) continue
    const msisdn = String(row.value ?? "").trim()
    if (!msisdn) continue
    const payeeName = String((row as { payee_name?: string }).payee_name ?? "").trim() || "Registered payee"
    lines.push({ payeeName, msisdn })
  }
  if (!lines.length) return null
  return {
    kind: "ke_mpesa_mobile",
    ussdPrefix: ESKNEXUSPRO_KE_MPESA_USSD_PREFIX,
    lines,
  }
}

/** Canonical ESK Kenya M-Pesa lines when DB row is missing (should not happen after migration). */
export function eskNexusProKeMpesaFallback(): KeMpesaMobileTemplate {
  return {
    kind: "ke_mpesa_mobile",
    ussdPrefix: ESKNEXUSPRO_KE_MPESA_USSD_PREFIX,
    lines: ESKNEXUSPRO_KE_MPESA_LINES.map((l) => ({ ...l })),
  }
}

/** Canonical ESK desk MTN line when DB row is missing (should not happen after migration). */
export function eskNexusProMtnFallback(): UgMtnMobileTemplate {
  return {
    kind: "ug_mtn_mobile",
    msisdn: ESKNEXUSPRO_MTN_MSISDN,
    payeeName: ESKNEXUSPRO_REGISTERED_PAYEE,
    payeeBrand: ESKNEXUSPRO_PAYEE_BRAND,
    ussdPrefix: ESKNEXUSPRO_MTN_USSD_PREFIX,
  }
}
