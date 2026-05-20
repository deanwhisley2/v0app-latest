/**
 * Fetch latest wallet balances immediately before a financial mutation.
 */
import { supabase } from "@/lib/supabaseClient"

export type LiveBalanceSnapshot = {
  available_balance: number
  retail_balance?: number
  withdrawal_pending_balance?: number
  total_earnings?: number
  active_container_earnings?: number
  container_withdrawable_earnings?: number
  lifetime_container_fees?: number
}

export async function fetchLiveBalanceSnapshot(token: string): Promise<LiveBalanceSnapshot | null> {
  const res = await fetch("/api/user/balance", {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  })
  if (!res.ok) return null
  const json = (await res.json().catch(() => null)) as LiveBalanceSnapshot | null
  if (!json) return null
  return {
    available_balance: Number(json.available_balance ?? 0),
    retail_balance: Number(json.retail_balance ?? 0),
    withdrawal_pending_balance: Number(json.withdrawal_pending_balance ?? 0),
    total_earnings: Number(json.total_earnings ?? 0),
    active_container_earnings: Number(json.active_container_earnings ?? 0),
    container_withdrawable_earnings: Number(json.container_withdrawable_earnings ?? 0),
    lifetime_container_fees: Number(json.lifetime_container_fees ?? 0),
  }
}

export type RefreshBeforeActionResult =
  | { ok: true; token: string; balance: LiveBalanceSnapshot }
  | { ok: false; error: string }

/** Session token + fresh balance; use before withdraw, trades, funding submits. */
export async function refreshLiveBalanceBeforeAction(): Promise<RefreshBeforeActionResult> {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const token = session?.access_token
  if (!token) return { ok: false, error: "Session expired. Sign in again." }

  const balance = await fetchLiveBalanceSnapshot(token)
  if (!balance) return { ok: false, error: "Could not refresh balance. Try again." }

  return { ok: true, token, balance }
}
