/** Level-5 direct receive rails — canonical in code; env may override wallet for rotation. */

export const ADMIN_USDT_TRC20_WALLET =
  (process.env.NEXUS_COMPANY_CRYPTO_WALLET ?? "").trim() ||
  "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t"

export const ADMIN_USDT_TRC20_NETWORK =
  (process.env.NEXUS_COMPANY_CRYPTO_NETWORK ?? "").trim() || "USDT TRC20"

export const ADMIN_USDT_BINANCE_DEEP_LINK =
  "https://app.binance.com/uni-qr/web3-token-details?utm_medium=share&tokenCA=TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t&binanceChainId=CT_195&chain=undefined"

export const UGANDA_AIRTEL_MERCHANT_ID = "7095287"
export const UGANDA_AIRTEL_MERCHANT_NAME =
  (process.env.NEXUS_UG_AIRTEL_MERCHANT_NAME ?? "").trim() || "Nexus Pro"
export const UGANDA_AIRTEL_USSD_PREFIX = "*1859#"

export const MAX_RETAILERS_ON_PAYMENT_PAGE = 2

export const ADMIN_DIRECT_FUND_CHANNELS = ["admin_crypto", "admin_airtel_ug"] as const
export type AdminDirectFundChannel = (typeof ADMIN_DIRECT_FUND_CHANNELS)[number]

export function isAdminDirectFundChannel(ch: string): ch is AdminDirectFundChannel {
  return ch === "admin_crypto" || ch === "admin_airtel_ug"
}
