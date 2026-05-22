/** Level-5 direct receive rails and TronLink USDT deposit wallet. */

/** USDT TRC20 token contract on TRON (not a user wallet). */
export const USDT_TRC20_CONTRACT =
  (process.env.NEXUS_USDT_TRC20_CONTRACT ?? "").trim() || "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t"

/** TronLink / Nexus Pro dedicated receive address (user sends USDT here). */
export const NEXUS_TRC20_RECEIVE_ADDRESS =
  (process.env.NEXUS_TRC20_RECEIVE_ADDRESS ?? "").trim() || "TYqESCZz8xcN5TZTdEDtRsbjNmhPWrVTNe"

/** @deprecated Use NEXUS_TRC20_RECEIVE_ADDRESS — kept for env alias compatibility. */
export const ADMIN_USDT_TRC20_WALLET = NEXUS_TRC20_RECEIVE_ADDRESS

export const ADMIN_USDT_TRC20_NETWORK =
  (process.env.NEXUS_COMPANY_CRYPTO_NETWORK ?? "").trim() || "USDT TRC20"

export const ADMIN_USDT_BINANCE_DEEP_LINK =
  "https://app.binance.com/uni-qr/web3-token-details?utm_medium=share&tokenCA=TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t&binanceChainId=CT_195&chain=undefined"

export const UGANDA_AIRTEL_MERCHANT_ID = "7095287"
/** Retailer brand on file (not the Airtel menu merchant label customers see). */
export const UGANDA_AIRTEL_RETAILER_BRAND =
  (process.env.NEXUS_UG_AIRTEL_RETAILER_BRAND ?? "").trim() || "Pegasus Technologies LTD"
/** @deprecated Use UGANDA_AIRTEL_RETAILER_BRAND — kept for env alias compatibility. */
export const UGANDA_AIRTEL_LEGAL_PAYEE = UGANDA_AIRTEL_RETAILER_BRAND
/** Merchant name shown on the Airtel Money menu for L5 admin direct receive. */
export const UGANDA_AIRTEL_MERCHANT_NAME =
  (process.env.NEXUS_UG_AIRTEL_MERCHANT_NAME ?? "").trim() || "Venture Nexus Pro"
export const UGANDA_AIRTEL_USSD_PREFIX = "*185*9#"

/** Retailer desk esknexuspro (ESK) — Uganda local mobile receive rails. */
export const ESKNEXUSPRO_AIRTEL_MERCHANT_ID = "7095290"
export const ESKNEXUSPRO_AIRTEL_MERCHANT_NAME = "Nexus Pro2"
/** Legal / brand entity on file for Uganda MoMo. */
export const ESKNEXUSPRO_PAYEE_BRAND = "Pegasus Technologies LTD"
/** @deprecated Use ESKNEXUSPRO_PAYEE_BRAND */
export const ESKNEXUSPRO_PAYEE_NAME = ESKNEXUSPRO_PAYEE_BRAND
/** Registered payee name customers must match on MTN send. */
export const ESKNEXUSPRO_REGISTERED_PAYEE = "AZIZZA NANKWANGA"
export const ESKNEXUSPRO_MTN_MSISDN = "+256794152339"
export const ESKNEXUSPRO_MTN_USSD_PREFIX = "*165*1#"

/** Kenya M-Pesa receive lines (Safaricom) — shown only to KE corridor customers. */
export const ESKNEXUSPRO_KE_MPESA_USSD_PREFIX = "*334#"
export const ESKNEXUSPRO_KE_MPESA_LINES: ReadonlyArray<{ payeeName: string; msisdn: string }> = [
  { payeeName: "Oscar Maloba Odhiambo", msisdn: "0115831794" },
]

export const MAX_RETAILERS_ON_PAYMENT_PAGE = 2

export const CRYPTO_MIN_CONFIRMATIONS = Math.max(
  1,
  Math.min(64, Number(process.env.CRYPTO_MIN_CONFIRMATIONS ?? 19) || 19),
)

export const ADMIN_DIRECT_FUND_CHANNELS = ["admin_crypto", "admin_airtel_ug"] as const
export type AdminDirectFundChannel = (typeof ADMIN_DIRECT_FUND_CHANNELS)[number]

export function isAdminDirectFundChannel(ch: string): ch is AdminDirectFundChannel {
  return ch === "admin_crypto" || ch === "admin_airtel_ug"
}

export { isUgandaAdminAirtelEligible } from "@/lib/operating-countries"
