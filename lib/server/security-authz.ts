import { createAdminClient } from "@/lib/supabaseAdmin"
import type { User } from "@supabase/supabase-js"
import {
  blocksCustomerTradingApis,
  computeRetailerCreditSeller,
  isRetailerCreditSellerFromEnv,
  normalizeTradingUserLevel,
  type TradingUserLevel,
} from "@/lib/platform-roles"

export {
  blocksCustomerTradingApis,
  computeRetailerCreditSeller,
  isRetailerCreditDesk,
  isLiquidityAdminDesk,
  isRetailerCreditSellerFromEnv,
  normalizeTradingUserLevel,
  resolvePlatformRouteRole,
  type TradingUserLevel,
} from "@/lib/platform-roles"

function readAdminIdentitySet(): Set<string> {
  const ids = (process.env.NEXUS_ADMIN_USER_IDS ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean)
  const emails = (process.env.NEXUS_ADMIN_EMAILS ?? "")
    .split(",")
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean)
  return new Set([...ids, ...emails])
}

/** True when this identity matches env-listed Level-5 / ops admin IDs or emails (directory redaction, receipts). */
export function isEnvListedAdminContact(userId: string, email: string | null | undefined): boolean {
  const adminSet = readAdminIdentitySet()
  if (adminSet.size === 0) return false
  if (adminSet.has(userId)) return true
  const em = (email ?? "").trim().toLowerCase()
  return em ? adminSet.has(em) : false
}

export function isConfiguredAdminUser(user: User): boolean {
  const adminSet = readAdminIdentitySet()
  if (adminSet.size === 0) return false
  const email = (user.email ?? "").toLowerCase()
  return adminSet.has(user.id) || (email ? adminSet.has(email) : false)
}

export async function getTradingUserLevel(userId: string): Promise<1 | 2 | 5> {
  const admin = createAdminClient()
  const { data } = await admin
    .from("profiles")
    .select("trading_user_level")
    .eq("id", userId)
    .maybeSingle()
  const level = Number(data?.trading_user_level ?? 1)
  if (level === 2 || level === 5) return level
  return 1
}

export async function requireAdminUser(user: User): Promise<void> {
  const level = await getTradingUserLevel(user.id)
  if (level === 5 || isConfiguredAdminUser(user)) return
  throw new Error("Admin access required")
}

/** Liquidity operations that must be restricted to profile Level 5 (not env-only admins). */
export async function requireLiquidityAdminLevel5(user: User): Promise<void> {
  const level = await getTradingUserLevel(user.id)
  if (level === 5) return
  throw new Error("Level 5 liquidity admin required")
}

/** Level 1, or Level 2 without designated retailer-credit-desk flag (same mobile-money → retailer flow as L1). */
export function canUseRetailFundingCustomerFlow(level: 1 | 2 | 5, retailerCreditSeller: boolean): boolean {
  if (level === 5) return false
  if (level === 1) return true
  if (level === 2) return !retailerCreditSeller
  return false
}

/** Single profile read for retailer funding authorization. */
export async function getRetailFundingCustomerGate(
  userId: string,
  email: string | null | undefined
): Promise<{
  level: 1 | 2 | 5
  retailerCreditSeller: boolean
  canUseRetailFundingCustomerFlow: boolean
}> {
  const admin = createAdminClient()
  const { data } = await admin
    .from("profiles")
    .select("trading_user_level, retailer_credit_seller")
    .eq("id", userId)
    .maybeSingle()
  const level = normalizeTradingUserLevel(Number(data?.trading_user_level ?? 1))
  const retailerCreditSeller = computeRetailerCreditSeller(userId, email, data?.retailer_credit_seller ?? null)
  return {
    level,
    retailerCreditSeller,
    canUseRetailFundingCustomerFlow: canUseRetailFundingCustomerFlow(level, retailerCreditSeller),
  }
}

/** Gate for copy/fix container APIs — level 2 traders without retailer flag are allowed. */
export async function getCustomerTradingAccessGate(
  userId: string,
  email: string | null | undefined,
): Promise<{
  level: TradingUserLevel
  retailerCreditSeller: boolean
  blocksCustomerTrading: boolean
}> {
  const gate = await getRetailFundingCustomerGate(userId, email)
  return {
    level: gate.level,
    retailerCreditSeller: gate.retailerCreditSeller,
    blocksCustomerTrading: blocksCustomerTradingApis(gate.level, gate.retailerCreditSeller),
  }
}
