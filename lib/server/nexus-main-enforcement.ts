import type { SupabaseClient } from "@supabase/supabase-js"

/** Ledger column that backs Nexus Main Account — never sum retail, earnings buckets, or pending withdrawal as spendable for trading. */
export const NEXUS_MAIN_BALANCE_COLUMN = "available_balance" as const

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

const CAS_MAX_ATTEMPTS = 8

async function selectBalances(sb: SupabaseClient, userId: string) {
  const { data, error } = await sb
    .from("user_balances")
    .select("available_balance, current_stake")
    .eq("user_id", userId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return {
    available_balance: round2(Number(data?.available_balance ?? 0)),
    current_stake: round2(Number(data?.current_stake ?? 0)),
  }
}

/**
 * Optimistic compare-and-swap on Nexus Main to prevent concurrent overspend (lost-update races).
 */
async function casUpdateBalances(
  sb: SupabaseClient,
  userId: string,
  prevAvail: number,
  nextAvail: number,
  nextStake: number,
): Promise<boolean> {
  const now = new Date().toISOString()
  const { data, error } = await sb
    .from("user_balances")
    .update({
      available_balance: nextAvail,
      current_stake: nextStake,
      last_updated: now,
    })
    .eq("user_id", userId)
    .eq("available_balance", prevAvail)
    .select("user_id")
    .maybeSingle()
  if (error) throw new Error(error.message)
  return Boolean(data)
}

/**
 * Fixed-trade open: debit principal + insurance from Nexus Main; lock principal into current_stake.
 */
export async function casOpenFixedTradeDebit(
  sb: SupabaseClient,
  userId: string,
  principalUsd: number,
  insuranceFeeUsd: number,
): Promise<
  | { ok: true; available_balance: number; current_stake: number }
  | { ok: false; reason: "insufficient"; available_balance: number; required: number }
> {
  const totalDebit = round2(principalUsd + insuranceFeeUsd)
  if (!(totalDebit > 0)) throw new Error("Invalid debit.")

  for (let attempt = 0; attempt < CAS_MAX_ATTEMPTS; attempt++) {
    const b = await selectBalances(sb, userId)
    if (b.available_balance < totalDebit) {
      return {
        ok: false,
        reason: "insufficient",
        available_balance: b.available_balance,
        required: totalDebit,
      }
    }
    const nextAvail = round2(b.available_balance - totalDebit)
    const nextStake = round2(b.current_stake + principalUsd)
    const applied = await casUpdateBalances(sb, userId, b.available_balance, nextAvail, nextStake)
    if (applied) {
      return { ok: true, available_balance: nextAvail, current_stake: nextStake }
    }
  }
  throw new Error("Concurrent balance update — retry fixed-trade open.")
}

/** Reserve copy-trade stake: debit Nexus Main only (no stake column — tracked per session row). */
export async function casReserveCopyTradeStake(
  sb: SupabaseClient,
  userId: string,
  stakeUsd: number,
): Promise<
  | { ok: true; available_balance: number }
  | { ok: false; reason: "insufficient"; available_balance: number; required: number }
> {
  const amt = round2(stakeUsd)
  if (!(amt > 0)) throw new Error("Invalid stake.")

  for (let attempt = 0; attempt < CAS_MAX_ATTEMPTS; attempt++) {
    const b = await selectBalances(sb, userId)
    if (b.available_balance < amt) {
      return {
        ok: false,
        reason: "insufficient",
        available_balance: b.available_balance,
        required: amt,
      }
    }
    const nextAvail = round2(b.available_balance - amt)
    const applied = await casUpdateBalances(sb, userId, b.available_balance, nextAvail, b.current_stake)
    if (applied) {
      return { ok: true, available_balance: nextAvail }
    }
  }
  throw new Error("Concurrent balance update — retry copy-trade open.")
}

/** Credit Nexus Main after copy-trade settlement (net after modeled fees). */
export async function casCreditNexusMainOnly(
  sb: SupabaseClient,
  userId: string,
  creditUsd: number,
): Promise<{ available_balance: number }> {
  const credit = round2(creditUsd)
  if (!(credit >= 0)) throw new Error("Invalid credit.")

  for (let attempt = 0; attempt < CAS_MAX_ATTEMPTS; attempt++) {
    const b = await selectBalances(sb, userId)
    const nextAvail = round2(b.available_balance + credit)
    const applied = await casUpdateBalances(sb, userId, b.available_balance, nextAvail, b.current_stake)
    if (applied) {
      return { available_balance: nextAvail }
    }
  }
  throw new Error("Concurrent balance update — retry copy-trade settlement.")
}

export async function readNexusMainAvailableUsd(sb: SupabaseClient, userId: string): Promise<number> {
  const { data, error } = await sb
    .from("user_balances")
    .select("available_balance")
    .eq("user_id", userId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return round2(Number(data?.available_balance ?? 0))
}
