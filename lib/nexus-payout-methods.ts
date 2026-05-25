export type NexusPayoutMethod = "mobile_money" | "crypto_trc20"

/** TRON TRC20 USDT address — base58, starts with T, 34 chars typical. */
export function isValidTrc20UsdtAddress(address: string): boolean {
  const a = address.trim()
  if (!/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(a)) return false
  return a.length >= 34 && a.length <= 36
}

export function normalizeDepositNumber(raw: string): string {
  return raw.replace(/\s+/g, "").trim()
}

export function normalizeWithdrawalNumber(raw: string): string {
  return raw.replace(/\s+/g, "").trim()
}

export const CRYPTO_WITHDRAWAL_NOTICE =
  "Crypto withdrawals are automatic and usually complete within 1–2 minutes. Make sure your TRON TRC20 USDT wallet address is correct before confirming. Wallet changes are restricted during active security review and may require up to 7 days for approval."

export const SECURITY_CODE_EDUCATION =
  "Your Nexus Security Code helps protect your funds and identity during sensitive account recovery or payout changes. Keep it private and memorable."

export const SENSITIVE_CHANGE_COOLDOWN_DAYS = 7
