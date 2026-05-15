import type { SupabaseClient } from "@supabase/supabase-js"

export type FloatLiquidityDebitSource = "pool" | "approver"

/** Optional treasury user UUID: company Nexus Main liquidity debited when retailers receive admin-approved float. */
export function adminRetailPoolUserId(): string | null {
  const id = process.env.NEXUS_ADMIN_RETAIL_POOL_USER_ID?.trim()
  return id && id.length >= 30 ? id : null
}

export function approverDebitWithoutPoolEnabled(): boolean {
  return process.env.NEXUS_FLOAT_DEBIT_USE_APPROVER_WITHOUT_POOL?.trim() === "1"
}

function debitViaApproverWhenPoolUnset(): boolean {
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
  /** Display-only `"none"` when env is missing (approvals will fail until configured). */
  debitSource: FloatLiquidityDebitSource | "none"
  poolUserId: string | null
  poolUserIdMasked: string | null
  masterLiquidityStrict: boolean
  summaryLine: string
  remediationLine: string | null
}

/**
 * Explains which liquidity source will be debited on retailer float approval (env-driven).
 * Prefer dedicated pool (NEXUS_ADMIN_RETAIL_POOL_USER_ID); otherwise explicit approver debit env.
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
      "Float approvals require a configured treasury debit (pool or approver Nexus Main). This mode is not ready until environment variables are set.",
    remediationLine: strict
      ? "NEXUS_MASTER_LIQUIDITY_STRICT is on: configure NEXUS_ADMIN_RETAIL_POOL_USER_ID or NEXUS_FLOAT_DEBIT_USE_APPROVER_WITHOUT_POOL=1."
      : "Set NEXUS_ADMIN_RETAIL_POOL_USER_ID to your operational treasury user UUID (recommended), or set NEXUS_FLOAT_DEBIT_USE_APPROVER_WITHOUT_POOL=1 to debit the approving admin.",
  }
}

/** When set, platform credits (float approvals) must debit pool or approver — never silent "none". */
export function masterLiquidityStrictEnabled(): boolean {
  return process.env.NEXUS_MASTER_LIQUIDITY_STRICT?.trim() === "1"
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
  const { data: row, error: selErr } = await sb
    .from("user_balances")
    .select("available_balance, retail_balance, withdrawal_pending_balance")
    .eq("user_id", userId)
    .maybeSingle()
  if (selErr) throw new Error(selErr.message)
  const avail = Number(row?.available_balance ?? 0)
  const retail = Number((row as { retail_balance?: unknown } | null)?.retail_balance ?? 0)
  const pend = Number((row as { withdrawal_pending_balance?: unknown } | null)?.withdrawal_pending_balance ?? 0)
  const now = new Date().toISOString()
  const { error: upErr } = await sb.from("user_balances").upsert(
    {
      user_id: userId,
      available_balance: avail + amount,
      retail_balance: retail,
      withdrawal_pending_balance: pend,
      last_updated: now,
    },
    { onConflict: "user_id" },
  )
  if (upErr) throw new Error(upErr.message)
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
  if (debitViaApproverWhenPoolUnset()) {
    await debitUserAvailableBalance(sb, approverUserId, amount, "Approver account")
    return "approver"
  }
  throw new Error(
    "Treasury debit required for float approval: set NEXUS_ADMIN_RETAIL_POOL_USER_ID (company Nexus Main pool UUID) or NEXUS_FLOAT_DEBIT_USE_APPROVER_WITHOUT_POOL=1 to debit the approving Level-5 operator Nexus Main. Credits cannot mint liquidity without a matching company-side debit.",
  )
}

export type RecycleTarget = "pool" | "approver"

/**
 * After L5 approves a withdrawal, recycled USD returns to the operational master pool user,
 * or — when no pool UUID is configured — to the approving operator Nexus Main (closed-loop internal liquidity).
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
  await creditUserAvailableBalance(sb, approverUserId, amount)
  return "approver"
}

/** Undo debit after failed retailer credit (pool or approver). */
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
  await creditUserAvailableBalance(sb, approverUserId, amount)
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
