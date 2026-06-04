import {
  ESKNEXUSPRO_AIRTEL_MERCHANT_NAME,
  ESKNEXUSPRO_REGISTERED_PAYEE,
} from "@/lib/server/admin-payment-config"
import {
  filterDeskPaymentLinesForNetwork,
  formatDeskPaymentLineValue,
} from "@/lib/retailer-desk-network-display"
import type { RetailerPaymentLine } from "@/lib/retailer-payment-templates"
import {
  parseKeMpesaMobileDesk,
  parseUgAirtelMerchantDesk,
  parseUgMtnMobileDesk,
} from "@/lib/retailer-payment-templates"

export type ResolvedPaymentRoute = {
  networkToken: string
  networkLogo: "MTN" | "Airtel" | "MPesa" | "OTHER"
  payeeNumberOrMerchantId: string
  registeredPayeeName: string
  ussdPrefix: string | null
  valid: boolean
  validationError: string | null
}

function normalizeNetworkToken(raw: string): string {
  const s = String(raw ?? "").trim()
  if (!s) return ""
  if (/m\s*-?\s*pesa|mpesa/i.test(s)) return "MPESA"
  const compact = s.toUpperCase().replace(/\s+/g, "")
  if (compact === "OTHER") return "OTHER"
  return compact
}

function networkLogo(token: string): ResolvedPaymentRoute["networkLogo"] {
  if (token === "MTN") return "MTN"
  if (token === "AIRTEL") return "Airtel"
  if (token === "MPESA") return "MPesa"
  return "OTHER"
}

/** Canonical stored payee for one payment_numbers row (never cross-network). */
export function storedPayeeNameForLine(row: RetailerPaymentLine, networkToken: string): string {
  const payeeName = String(row.payee_name ?? "").trim()
  if (payeeName) return payeeName
  const pt = String(row.payment_type ?? "").toLowerCase()
  const lab = String(row.label ?? "").toLowerCase()
  if (networkToken === "AIRTEL" || pt === "airtel_merchant_ug" || lab.includes("airtel")) {
    return String(row.merchant_name ?? ESKNEXUSPRO_AIRTEL_MERCHANT_NAME).trim()
  }
  return ""
}

function primaryLineForNetwork(
  paymentNumbers: unknown,
  networkToken: string,
): RetailerPaymentLine | null {
  const filtered = filterDeskPaymentLinesForNetwork(paymentNumbers, networkToken)
  return filtered[0] ?? null
}

function resolvePayeeName(
  paymentNumbers: unknown,
  networkToken: string,
  registeredPayeeNames: string | null | undefined,
): string | null {
  const deskRegistered = String(registeredPayeeNames ?? "").trim()
  if (networkToken === "MTN") {
    return parseUgMtnMobileDesk(
      filterDeskPaymentLinesForNetwork(paymentNumbers, "MTN"),
      deskRegistered || ESKNEXUSPRO_REGISTERED_PAYEE,
    )?.payeeName ?? null
  }
  if (networkToken === "AIRTEL") {
    return parseUgAirtelMerchantDesk(
      filterDeskPaymentLinesForNetwork(paymentNumbers, "Airtel"),
      null,
    )?.payeeName ?? null
  }
  if (networkToken === "MPESA") {
    const mpesa = parseKeMpesaMobileDesk(filterDeskPaymentLinesForNetwork(paymentNumbers, "MPESA"))
    return mpesa?.lines[0]?.payeeName ?? null
  }
  const line = primaryLineForNetwork(paymentNumbers, networkToken)
  if (!line) return deskRegistered || null
  return storedPayeeNameForLine(line, networkToken) || deskRegistered || null
}

function resolveUssdPrefix(paymentNumbers: unknown, networkToken: string): string | null {
  if (networkToken === "MTN") {
    return (
      parseUgMtnMobileDesk(filterDeskPaymentLinesForNetwork(paymentNumbers, "MTN"), null)?.ussdPrefix ??
      null
    )
  }
  if (networkToken === "AIRTEL") {
    return (
      parseUgAirtelMerchantDesk(filterDeskPaymentLinesForNetwork(paymentNumbers, "Airtel"), null)
        ?.ussdPrefix ?? null
    )
  }
  if (networkToken === "MPESA") {
    return parseKeMpesaMobileDesk(filterDeskPaymentLinesForNetwork(paymentNumbers, "MPESA"))?.ussdPrefix ?? null
  }
  const line = primaryLineForNetwork(paymentNumbers, networkToken)
  return line?.ussd_prefix ? String(line.ussd_prefix).trim() : null
}

/**
 * Validates that displayed payee matches the selected route's stored line payee — not another network's desk string.
 */
export function validatePaymentRoutePayee(params: {
  paymentNumbers: unknown
  networkToken: string
  registeredPayeeName: string
  registeredPayeeNamesDesk?: string | null
}): { valid: boolean; error: string | null } {
  const line = primaryLineForNetwork(params.paymentNumbers, params.networkToken)
  if (!line) {
    return { valid: false, error: "NO_PAYMENT_LINE_FOR_NETWORK" }
  }

  const storedForLine = storedPayeeNameForLine(line, params.networkToken)
  const displayed = params.registeredPayeeName.trim()
  if (!displayed) {
    return { valid: false, error: "MISSING_PAYEE_NAME" }
  }

  const deskRegistered = String(params.registeredPayeeNamesDesk ?? "").trim()

  if (params.networkToken === "AIRTEL") {
    if (deskRegistered && displayed.toLowerCase() === deskRegistered.toLowerCase()) {
      const storedLower = storedForLine.toLowerCase()
      const deskLower = deskRegistered.toLowerCase()
      if (storedLower && storedLower !== deskLower) {
        return {
          valid: false,
          error: "AIRTEL_PAYEE_CONTAMINATED_WITH_DESK_MTN_NAME",
        }
      }
    }
    const expected = storedForLine || String(line.merchant_name ?? "").trim()
    if (expected && displayed.toLowerCase() !== expected.toLowerCase()) {
      return { valid: false, error: "AIRTEL_PAYEE_MISMATCH" }
    }
    return { valid: true, error: null }
  }

  if (params.networkToken === "MTN") {
    const expected = storedForLine || deskRegistered || ESKNEXUSPRO_REGISTERED_PAYEE
    if (expected && displayed.toLowerCase() !== expected.toLowerCase()) {
      return { valid: false, error: "MTN_PAYEE_MISMATCH" }
    }
    return { valid: true, error: null }
  }

  if (storedForLine && displayed.toLowerCase() !== storedForLine.toLowerCase()) {
    return { valid: false, error: "PAYEE_MISMATCH" }
  }

  return { valid: true, error: null }
}

export function resolvePaymentRouteForNetwork(
  paymentNumbers: unknown,
  mobileNetwork: string,
  registeredPayeeNames?: string | null,
): ResolvedPaymentRoute | null {
  const networkToken = normalizeNetworkToken(mobileNetwork)
  if (!networkToken || networkToken === "OTHER") return null

  const filtered = filterDeskPaymentLinesForNetwork(paymentNumbers, mobileNetwork)
  const line = filtered[0]
  if (!line) return null

  const payeeNumberOrMerchantId = formatDeskPaymentLineValue(line)
  const registeredPayeeName = resolvePayeeName(paymentNumbers, networkToken, registeredPayeeNames) ?? ""
  const validation = validatePaymentRoutePayee({
    paymentNumbers,
    networkToken,
    registeredPayeeName,
    registeredPayeeNamesDesk: registeredPayeeNames,
  })

  return {
    networkToken,
    networkLogo: networkLogo(networkToken),
    payeeNumberOrMerchantId,
    registeredPayeeName,
    ussdPrefix: resolveUssdPrefix(paymentNumbers, networkToken),
    valid: validation.valid,
    validationError: validation.error,
  }
}

/** Server/admin: log when a desk route would show the wrong payee. */
export function logPaymentRouteValidationFailure(context: string, route: ResolvedPaymentRoute, meta: Record<string, unknown> = {}): void {
  if (route.valid) return
  console.warn(`[payment-route] ${context}`, {
    network: route.networkToken,
    payee: route.registeredPayeeName,
    merchantOrNumber: route.payeeNumberOrMerchantId,
    error: route.validationError,
    ...meta,
  })
}
