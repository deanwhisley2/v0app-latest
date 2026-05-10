/**
 * Single source of truth for Nexus trading tiers (profiles.trading_user_level + optional retailer desk).
 * Used by header badge, settings copy, and GET /api/health/launch (public matrix only).
 */

export type NexusTradingTierKey = "l1_customer" | "l2_trader" | "l2_retail_desk" | "l5_liquidity_admin"

export type NexusTierDefinition = {
  key: NexusTradingTierKey
  badge: string
  title: string
  summary: string
  capabilities: string[]
}

const L1: NexusTierDefinition = {
  key: "l1_customer",
  badge: "L1 · Customer",
  title: "Level 1 — Customer",
  summary: "Standard trading, funding via crypto or local mobile money through qualified retailers.",
  capabilities: [
    "Trade, markets, wallet portfolio",
    "Add funds: company crypto address or local mobile money → retailer pairing",
    "Withdrawals: request from Nexus Main; pending until liquidity review",
    "Wall Street: copy / fixed “container” experiences when level ≤ 2",
  ],
}

const L2_TRADER: NexusTierDefinition = {
  key: "l2_trader",
  badge: "L2 · Trader",
  title: "Level 2 — Trader (non–credit-desk)",
  summary: "Same retail funding paths as L1 until designated as a credit desk (profiles.retailer_credit_seller).",
  capabilities: [
    "Trade, markets, wallet portfolio",
    "Add funds: crypto or local MM same as L1 when not the designated desk account",
    "Wall Street: container / copy-trade UI same band as L1",
    "Become a retail desk by Level 2 + retailer_credit_seller (admin-controlled)",
  ],
}

const L2_DESK: NexusTierDefinition = {
  key: "l2_retail_desk",
  badge: "L2 · Retail desk",
  title: "Level 2 — Retail credit desk",
  summary: "Designated liquidity partner: incoming fund queue, internal credits, retailer admin top-up requests.",
  capabilities: [
    "Wallet → Assets: retailer operational panel (queues, basin, appeals)",
    "Approve/reject incoming mobile-money funding for matched customers",
    "Request crypto float top-up (Level 5 approves + commission)",
    "Retail balance transfers per policy; fixed-trade access per desk rules",
  ],
}

const L5: NexusTierDefinition = {
  key: "l5_liquidity_admin",
  badge: "L5 · Liquidity admin",
  title: "Level 5 — Liquidity admin",
  summary: "Operate liquidity ledger: withdrawal review, retailer funding appeals, retailer crypto top-up credits.",
  capabilities: [
    "Wallet → Assets: admin operational assets + liquidity tooling",
    "Add Funds (admin): legacy / appealed funding queue, retailer crypto top-up approval (+commission)",
    "API routes under /api/admin/* for withdrawals, retailer funding, whitelist where applicable",
    "Operational continuity HUD + expert governance visibility",
    "No customer retail funding path (by design)",
  ],
}

/** Resolve UI tier from numeric level and optional retailer credit desk flag. */
export function resolveNexusTierDefinition(
  level: number,
  retailerCreditDesk: boolean
): NexusTierDefinition {
  if (level === 5) return L5
  if (level === 2 && retailerCreditDesk) return L2_DESK
  if (level === 2) return L2_TRADER
  return L1
}

export function getTierBadgeLabel(level: number, retailerCreditDesk = false): string {
  return resolveNexusTierDefinition(level, retailerCreditDesk).badge
}

/** Public documentation: all tiers for /api/health/launch (no user data). */
export const NEXUS_TIER_MATRIX_PUBLIC: NexusTierDefinition[] = [L1, L2_TRADER, L2_DESK, L5]
