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
/** Legal payee printed on the MoMo receipt (merchant name on network may differ). */
export const UGANDA_AIRTEL_LEGAL_PAYEE =
  (process.env.NEXUS_UG_AIRTEL_LEGAL_PAYEE ?? "").trim() || "Pegasus Technologies LTD"
export const UGANDA_AIRTEL_MERCHANT_NAME =
  (process.env.NEXUS_UG_AIRTEL_MERCHANT_NAME ?? "").trim() || "Nexus Pro"
export const UGANDA_AIRTEL_USSD_PREFIX = "*185*9#"

/** Retailer desk esknexuspro — Pegasus / Nexus Pro2 merchant (local_mobile responsibility). */
export const ESKNEXUSPRO_AIRTEL_MERCHANT_ID = "7095290"
export const ESKNEXUSPRO_AIRTEL_MERCHANT_NAME = "Nexus Pro2"
export const ESKNEXUSPRO_PAYEE_NAME = "Pegasus Technologies LTD"

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
