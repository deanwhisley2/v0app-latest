import type { RetailerPaymentLine } from "@/lib/retailer-payment-templates"

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
