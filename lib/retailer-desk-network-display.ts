import type { RetailerPaymentLine } from "@/lib/retailer-payment-templates"
import {
  parseKeMpesaMobileDesk,
  parseUgAirtelMerchantDesk,
  parseUgMtnMobileDesk,
} from "@/lib/retailer-payment-templates"

/** Show only payment lines matching the customer's selected network (never mix MTN + Airtel on one card). */
export function filterDeskPaymentLinesForNetwork(
  paymentNumbers: unknown,
  mobileNetwork: string,
): RetailerPaymentLine[] {
  const rows = (Array.isArray(paymentNumbers) ? paymentNumbers : []) as RetailerPaymentLine[]
  const net = mobileNetwork.trim().toUpperCase()
  if (!net || net === "OTHER") return rows

  if (net === "MTN") {
    return rows.filter((row) => {
      const pt = String(row.payment_type ?? "").toLowerCase()
      const lab = String(row.label ?? "").toLowerCase()
      return pt === "mtn_mobile_ug" || lab.includes("mtn")
    })
  }
  if (net === "AIRTEL") {
    return rows.filter((row) => {
      const pt = String(row.payment_type ?? "").toLowerCase()
      const lab = String(row.label ?? "").toLowerCase()
      return pt === "airtel_merchant_ug" || lab.includes("airtel")
    })
  }
  if (/MPESA/i.test(net)) {
    return rows.filter((row) => {
      const pt = String(row.payment_type ?? "").toLowerCase()
      const lab = String(row.label ?? "").toLowerCase()
      return pt === "mpesa_mobile_ke" || lab.includes("mpesa")
    })
  }
  return rows
}

export function formatDeskPaymentLineValue(row: RetailerPaymentLine): string {
  const merchantId = row.merchant_id ?? row.value
  if (merchantId) return String(merchantId).trim()
  return String(row.value ?? "").trim()
}

export function formatDeskPaymentLinesSummary(
  paymentNumbers: unknown,
  mobileNetwork: string,
): string[] {
  return filterDeskPaymentLinesForNetwork(paymentNumbers, mobileNetwork)
    .map((row) => {
      const val = formatDeskPaymentLineValue(row)
      if (!val) return ""
      const lab = String(row.label ?? "").trim()
      return lab ? `${lab}: ${val}` : val
    })
    .filter(Boolean)
}

/** Payee name for the selected network only — never the full multi-network desk string. */
export function deskPayeeDisplayForNetwork(
  paymentNumbers: unknown,
  mobileNetwork: string,
  registeredPayeeNames?: string | null,
): string | null {
  const net = mobileNetwork.trim().toUpperCase()
  const filtered = filterDeskPaymentLinesForNetwork(paymentNumbers, mobileNetwork)
  if (net === "MTN") {
    return parseUgMtnMobileDesk(filtered, registeredPayeeNames)?.payeeName ?? null
  }
  if (net === "AIRTEL") {
    return parseUgAirtelMerchantDesk(filtered, registeredPayeeNames)?.payeeName ?? null
  }
  if (/MPESA/i.test(net)) {
    const mpesa = parseKeMpesaMobileDesk(filtered)
    return mpesa?.lines[0]?.payeeName ?? null
  }
  const first = filtered[0]
  if (!first) return registeredPayeeNames?.trim() || null
  return registeredPayeeNames?.trim() || null
}
