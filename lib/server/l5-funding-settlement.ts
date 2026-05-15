import type { SupabaseClient } from "@supabase/supabase-js"
import { treasury } from "@/lib/financial/treasury-authority"

const TABLE_BALANCES = "user_balances"

/**
 * Credit customer Nexus Main from MAIN_TREASURY (company-funded approval).
 * Debits treasury first; compensating CREDIT if customer balance upsert fails.
 */
async function treasuryDebitReferenceExists(
  admin: SupabaseClient,
  referenceId: string,
): Promise<boolean> {
  const { data, error } = await admin
    .from("unified_ledger")
    .select("transaction_id")
    .eq("reference_id", referenceId)
    .eq("operation", "DEBIT")
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return Boolean(data)
}

export async function creditCustomerMainFromTreasuryUsd(
  admin: SupabaseClient,
  params: {
    customerUserId: string
    amountUsd: number
    referenceId: string
    adminUserId: string
    reason: string
  },
): Promise<{ treasuryTransactionId: string; idempotent?: boolean }> {
  const amt = params.amountUsd
  if (!(amt > 0) || Number.isNaN(amt)) throw new Error("Invalid settlement amount.")

  if (await treasuryDebitReferenceExists(admin, params.referenceId)) {
    return { treasuryTransactionId: params.referenceId, idempotent: true }
  }

  const tr = await treasury.mutateTreasury(
    "DEBIT",
    amt,
    params.referenceId,
    params.reason,
    params.adminUserId,
    "MAIN_TREASURY",
  )
  if (!tr.success) {
    throw new Error(tr.error ?? "Treasury debit failed.")
  }

  const { data: toRow, error: selToErr } = await admin
    .from(TABLE_BALANCES)
    .select("available_balance")
    .eq("user_id", params.customerUserId)
    .maybeSingle()
  if (selToErr) {
    await treasury.mutateTreasury(
      "CREDIT",
      amt,
      `rollback:${params.referenceId}`,
      "Rollback: customer balance read failed after treasury debit",
      params.adminUserId,
      "MAIN_TREASURY",
    )
    throw new Error(selToErr.message)
  }

  const toAvail = Number(toRow?.available_balance ?? 0)
  const now = new Date().toISOString()
  const { error: creditErr } = await admin.from(TABLE_BALANCES).upsert(
    {
      user_id: params.customerUserId,
      available_balance: toAvail + amt,
      last_updated: now,
    },
    { onConflict: "user_id" },
  )
  if (creditErr) {
    const rb = await treasury.mutateTreasury(
      "CREDIT",
      amt,
      `rollback:${params.referenceId}`,
      "Rollback after customer credit failure",
      params.adminUserId,
      "MAIN_TREASURY",
    )
    if (!rb.success) {
      console.error("[l5-funding-settlement] CRITICAL: treasury rollback failed", rb.error)
    }
    throw new Error(`Customer credit failed: ${creditErr.message}`)
  }

  return { treasuryTransactionId: tr.transactionId }
}
