/**
 * Platform role separation (pure helpers — safe for middleware and client).
 *
 * Trading level (profiles.trading_user_level) controls tier features only.
 * Retailer desk = explicit profiles.retailer_credit_seller or env allowlist (NOT level 2 alone).
 * Admin desk = level 5 liquidity operations (separate from customer trading APIs).
 */

export type PlatformRouteRole = "USER" | "RETAILER_DESK" | "ADMIN_DESK"

export type TradingUserLevel = 1 | 2 | 5

function readCsvSet(raw: string): Set<string> {
  return new Set(
    raw
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean),
  )
}

/** Env allowlist for designated Level-2 retailer credit desks (IDs or emails). */
export function isRetailerCreditSellerFromEnv(userId: string, email: string | null | undefined): boolean {
  const ids = readCsvSet(process.env.NEXUS_RETAILER_CREDIT_SELLER_IDS ?? "")
  const emails = new Set(
    (process.env.NEXUS_RETAILER_CREDIT_SELLER_EMAILS ?? "")
      .split(",")
      .map((v) => v.trim().toLowerCase())
      .filter(Boolean),
  )
  if (ids.has(userId)) return true
  const em = (email ?? "").toLowerCase()
  return em ? emails.has(em) : false
}

/** DB flag (profiles.retailer_credit_seller) OR env allowlist — never inferred from level alone. */
export function computeRetailerCreditSeller(
  userId: string,
  email: string | null | undefined,
  profileFlag: boolean | null | undefined,
): boolean {
  return Boolean(profileFlag) || isRetailerCreditSellerFromEnv(userId, email)
}

export function normalizeTradingUserLevel(raw: number): TradingUserLevel {
  if (raw === 2) return 2
  if (raw === 5) return 5
  return 1
}

/** Operational retailer liquidity desk (manual / env) — not “any level 2 user”. */
export function isRetailerCreditDesk(level: number, retailerCreditSeller: boolean): boolean {
  return level === 2 && retailerCreditSeller
}

/** Level-5 liquidity / treasury operations shell. */
export function isLiquidityAdminDesk(level: number): boolean {
  return level === 5
}

/** Customer container trading APIs (copy/fix) — blocked only for retailer desk or L5 admin. */
export function blocksCustomerTradingApis(level: TradingUserLevel, retailerCreditSeller: boolean): boolean {
  return isLiquidityAdminDesk(level) || isRetailerCreditDesk(level, retailerCreditSeller)
}

export function resolvePlatformRouteRole(params: {
  tradingUserLevel: number
  retailerCreditSellerFlag: boolean | null | undefined
  userId: string
  email: string | null | undefined
}): PlatformRouteRole {
  const level = normalizeTradingUserLevel(Number(params.tradingUserLevel ?? 1))
  if (isLiquidityAdminDesk(level)) return "ADMIN_DESK"
  const retailerDesk = isRetailerCreditDesk(
    level,
    computeRetailerCreditSeller(params.userId, params.email, params.retailerCreditSellerFlag),
  )
  if (retailerDesk) return "RETAILER_DESK"
  return "USER"
}
