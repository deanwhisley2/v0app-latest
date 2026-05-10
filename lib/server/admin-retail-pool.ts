import type { SupabaseClient } from "@supabase/supabase-js"

/** Optional treasury user UUID: company Nexus Main liquidity debited when retailers receive admin-approved float. */
export function adminRetailPoolUserId(): string | null {
  const id = process.env.NEXUS_ADMIN_RETAIL_POOL_USER_ID?.trim()
  return id && id.length >= 30 ? id : null
}

/**
 * Debits treasury `available_balance` when approving retailer Retail Balance credits.
 * Set NEXUS_ADMIN_RETAIL_POOL_USER_ID to a dedicated service account uuid to enforce pooled liquidity.
 */
export async function debitAdminRetailPoolIfConfigured(sb: SupabaseClient, amount: number): Promise<void> {
  const poolUid = adminRetailPoolUserId()
  if (!poolUid) return
  if (!(amount > 0) || Number.isNaN(amount)) throw new Error("Invalid pool debit amount.")

  const { data: row } = await sb.from("user_balances").select("available_balance").eq("user_id", poolUid).maybeSingle()
  const avail = Number(row?.available_balance ?? 0)
  if (avail < amount) {
    throw new Error(
      `Company retail liquidity account insufficient for this approval (requires ${amount.toFixed(2)} USD available on treasury user).`,
    )
  }

  const now = new Date().toISOString()
  const { error } = await sb
    .from("user_balances")
    .update({ available_balance: avail - amount, last_updated: now })
    .eq("user_id", poolUid)
  if (error) throw new Error(error.message)
}

/** Undo a treasury debit after a failed retailer credit (best-effort compensation). */
export async function refundAdminRetailPoolIfConfigured(sb: SupabaseClient, amount: number): Promise<void> {
  const poolUid = adminRetailPoolUserId()
  if (!poolUid) return
  if (!(amount > 0)) return
  const { data: row } = await sb.from("user_balances").select("available_balance").eq("user_id", poolUid).maybeSingle()
  const avail = Number(row?.available_balance ?? 0)
  const now = new Date().toISOString()
  await sb.from("user_balances").update({ available_balance: avail + amount, last_updated: now }).eq("user_id", poolUid)
}
