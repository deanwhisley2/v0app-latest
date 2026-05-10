import type { SupabaseClient } from "@supabase/supabase-js"

export type FloatLiquidityDebitSource = "pool" | "approver" | "none"

/** Optional treasury user UUID: company Nexus Main liquidity debited when retailers receive admin-approved float. */
export function adminRetailPoolUserId(): string | null {
  const id = process.env.NEXUS_ADMIN_RETAIL_POOL_USER_ID?.trim()
  return id && id.length >= 30 ? id : null
}

export function approverDebitWithoutPoolEnabled(): boolean {
  return process.env.NEXUS_FLOAT_DEBIT_USE_APPROVER_WITHOUT_POOL?.trim() === "1"
}

function useApproverWhenPoolUnset(): boolean {
  return approverDebitWithoutPoolEnabled()
}

/** Short display id for ops (full UUID remains server-only except masked). */
export function maskUserIdForOps(id: string | null | undefined): string | null {
  const s = typeof id === "string" ? id.trim() : ""
  if (s.length < 24) return null
  return `${s.slice(0, 8)}…${s.slice(-6)}`
}

export type TreasurySettlementModeInfo = {
  settlementMode: "dedicated_pool" | "approver_nexus_main" | "none_unconfigured"
  debitSource: FloatLiquidityDebitSource
  poolUserId: string | null
  poolUserIdMasked: string | null
  masterLiquidityStrict: boolean
  summaryLine: string
  remediationLine: string | null
}

/**
 * Explains which liquidity source will be debited on retailer float approval (env-driven).
 * Prefer dedicated pool (NEXUS_ADMIN_RETAIL_POOL_USER_ID); fallback approver debit is explicit opt-in.
 */
export function getTreasurySettlementModeInfo(): TreasurySettlementModeInfo {
  const poolUid = adminRetailPoolUserId()
  const strict = masterLiquidityStrictEnabled()
  if (poolUid) {
    return {
      settlementMode: "dedicated_pool",
      debitSource: "pool",
      poolUserId: poolUid,
      poolUserIdMasked: maskUserIdForOps(poolUid),
      masterLiquidityStrict: strict,
      summaryLine:
        "Dedicated treasury pool: each approval debits this account’s Nexus Main by the credited amount (base + commission). Retailer Retail Balance increases by the same credited amount.",
      remediationLine: null,
    }
  }
  if (approverDebitWithoutPoolEnabled()) {
    return {
      settlementMode: "approver_nexus_main",
      debitSource: "approver",
      poolUserId: null,
      poolUserIdMasked: null,
      masterLiquidityStrict: strict,
      summaryLine:
        "Approver debit mode: each approval debits the approving Level-5 operator’s Nexus Main by the credited amount (base + commission). No shared treasury pool UUID is configured.",
      remediationLine: null,
    }
  }
  return {
    settlementMode: "none_unconfigured",
    debitSource: "none",
    poolUserId: null,
    poolUserIdMasked: null,
    masterLiquidityStrict: strict,
    summaryLine:
      "Treasury settlement is not configured. Retailers can still be credited Retail Balance with no automatic company-side debit — not recommended for production accounting.",
    remediationLine: strict
      ? "NEXUS_MASTER_LIQUIDITY_STRICT is on: configure NEXUS_ADMIN_RETAIL_POOL_USER_ID or NEXUS_FLOAT_DEBIT_USE_APPROVER_WITHOUT_POOL=1."
      : "Set NEXUS_ADMIN_RETAIL_POOL_USER_ID to your operational treasury user UUID (recommended), or set NEXUS_FLOAT_DEBIT_USE_APPROVER_WITHOUT_POOL=1 to debit the approving admin.",
  }
}

/** When set, platform credits (float approvals) must debit pool or approver — never silent "none". */
export function masterLiquidityStrictEnabled(): boolean {
  return process.env.NEXUS_MASTER_LIQUIDITY_STRICT?.trim() === "1"
}

function recycleWithdrawalToApproverWhenNoPool(): boolean {
  return process.env.NEXUS_WITHDRAWAL_RECYCLE_TO_APPROVER_WITHOUT_POOL?.trim() === "1"
}

async function debitUserAvailableBalance(sb: SupabaseClient, userId: string, amount: number, label: string): Promise<void> {
  if (!(amount > 0) || Number.isNaN(amount)) throw new Error(`Invalid ${label} debit amount.`)
  const { data: row } = await sb.from("user_balances").select("available_balance").eq("user_id", userId).maybeSingle()
  const avail = Number(row?.available_balance ?? 0)
  if (avail < amount) {
    throw new Error(`${label} insufficient Nexus Main available for this approval (needs ${amount.toFixed(2)}, has ${avail.toFixed(2)}).`)
  }
  const now = new Date().toISOString()
  const { error } = await sb
    .from("user_balances")
    .update({ available_balance: avail - amount, last_updated: now })
    .eq("user_id", userId)
  if (error) throw new Error(error.message)
}

async function creditUserAvailableBalance(sb: SupabaseClient, userId: string, amount: number): Promise<void> {
  if (!(amount > 0)) return
  const { data: row } = await sb.from("user_balances").select("available_balance").eq("user_id", userId).maybeSingle()
  const avail = Number(row?.available_balance ?? 0)
  const now = new Date().toISOString()
  await sb.from("user_balances").update({ available_balance: avail + amount, last_updated: now }).eq("user_id", userId)
}

/**
 * Prefer dedicated pool user; optional fallback debits the approving Level-5 actor's Nexus Main when
 * `NEXUS_FLOAT_DEBIT_USE_APPROVER_WITHOUT_POOL=1` (explicit ops choice — avoids silent infinite float).
 */
export async function debitFloatLiquidityOnApproval(
  sb: SupabaseClient,
  amount: number,
  approverUserId: string,
): Promise<FloatLiquidityDebitSource> {
  const poolUid = adminRetailPoolUserId()
  if (poolUid) {
    await debitAdminRetailPoolIfConfigured(sb, amount)
    return "pool"
  }
  if (useApproverWhenPoolUnset()) {
    await debitUserAvailableBalance(sb, approverUserId, amount, "Approver account")
    return "approver"
  }
  if (masterLiquidityStrictEnabled()) {
    throw new Error(
      "NEXUS_MASTER_LIQUIDITY_STRICT requires NEXUS_ADMIN_RETAIL_POOL_USER_ID (master pool) or NEXUS_FLOAT_DEBIT_USE_APPROVER_WITHOUT_POOL=1 for float/settlement debits.",
    )
  }
  return "none"
}

export type RecycleTarget = "pool" | "approver" | "none"

/**
 * After L5 approves a withdrawal, recycled USD returns to the operational master (pool user) or
 * (with env) the approving operator — completing the internal loop before external payout rails.
 */
export async function creditMasterLiquidityFromApprovedWithdrawal(
  sb: SupabaseClient,
  amount: number,
  approverUserId: string,
): Promise<RecycleTarget> {
  const poolUid = adminRetailPoolUserId()
  if (poolUid) {
    await creditUserAvailableBalance(sb, poolUid, amount)
    return "pool"
  }
  if (recycleWithdrawalToApproverWhenNoPool()) {
    await creditUserAvailableBalance(sb, approverUserId, amount)
    return "approver"
  }
  return "none"
}

/** Undo debit after failed retailer credit (pool, approver, or no-op). */
export async function refundFloatLiquidityDebit(
  sb: SupabaseClient,
  amount: number,
  source: FloatLiquidityDebitSource,
  approverUserId: string,
): Promise<void> {
  if (!(amount > 0)) return
  if (source === "pool") {
    await refundAdminRetailPoolIfConfigured(sb, amount)
    return
  }
  if (source === "approver") {
    await creditUserAvailableBalance(sb, approverUserId, amount)
  }
}

/**
 * Debits treasury `available_balance` when approving retailer Retail Balance credits.
 * Set NEXUS_ADMIN_RETAIL_POOL_USER_ID to a dedicated service account uuid to enforce pooled liquidity.
 */
export async function debitAdminRetailPoolIfConfigured(sb: SupabaseClient, amount: number): Promise<void> {
  const poolUid = adminRetailPoolUserId()
  if (!poolUid) return
  await debitUserAvailableBalance(sb, poolUid, amount, "Company retail liquidity account")
}

/** Undo a treasury debit after a failed retailer credit (best-effort compensation). */
export async function refundAdminRetailPoolIfConfigured(sb: SupabaseClient, amount: number): Promise<void> {
  const poolUid = adminRetailPoolUserId()
  if (!poolUid) return
  await creditUserAvailableBalance(sb, poolUid, amount)
}
