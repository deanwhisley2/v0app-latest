export type RetailerPaymentLine = {
  label?: string
  value?: string
  payment_type?: string
  merchant_id?: string
  merchant_name?: string
}

export type UgAirtelMerchantTemplate = {
  kind: "ug_airtel_merchant"
  merchantId: string
  merchantName: string
  payeeName: string
  ussdPrefix: string
}

const DEFAULT_USSD = "*1859#"
const DEFAULT_MERCHANT_NAME = "Nexus Pro2"
const DEFAULT_PAYEE = "Pegasus Technologies"

export function parseUgAirtelMerchantDesk(
  paymentNumbers: unknown,
  registeredPayeeNames: string | null | undefined,
): UgAirtelMerchantTemplate | null {
  const rows = Array.isArray(paymentNumbers) ? (paymentNumbers as RetailerPaymentLine[]) : []
  for (const row of rows) {
    const pt = String(row.payment_type ?? "").toLowerCase()
    const lab = String(row.label ?? "").toLowerCase()
    if (pt === "airtel_merchant_ug" || lab.includes("airtel")) {
      const merchantId = String(row.merchant_id ?? row.value ?? "").trim()
      if (merchantId) {
        return {
          kind: "ug_airtel_merchant",
          merchantId,
          merchantName: String(row.merchant_name ?? DEFAULT_MERCHANT_NAME).trim(),
          payeeName: String(registeredPayeeNames ?? DEFAULT_PAYEE).trim(),
          ussdPrefix: DEFAULT_USSD,
        }
      }
    }
  }
  return null
}
