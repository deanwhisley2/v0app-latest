import type { SupabaseClient } from "@supabase/supabase-js"

/** Consecutive admin rejections before automated payout hold. */
export const WITHDRAWAL_REJECTION_COOLDOWN_THRESHOLD = 2

/** Automated payout hold duration after threshold is reached. */
export const WITHDRAWAL_REJECTION_COOLDOWN_MS = 5 * 60 * 60 * 1000

export type WithdrawalRejectionCooldownState = {
  consecutiveRejectionsCount: number
  cooldownUntil: string | null
  cooldownActive: boolean
  msRemaining: number
}

function parseCooldownUntil(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null
  const ms = new Date(raw).getTime()
  return Number.isFinite(ms) ? raw : null
}

export async function readWithdrawalRejectionCooldown(
  admin: SupabaseClient,
  userId: string,
  now = new Date(),
): Promise<WithdrawalRejectionCooldownState> {
  const { data, error } = await admin
    .from("profiles")
    .select("withdrawal_cooldown_until, consecutive_rejections_count")
    .eq("id", userId)
    .maybeSingle()
  if (error) throw new Error(error.message)

  const consecutiveRejectionsCount = Math.max(
    0,
    Math.floor(Number(data?.consecutive_rejections_count ?? 0)),
  )
  let cooldownUntil = parseCooldownUntil(data?.withdrawal_cooldown_until)
  const untilMs = cooldownUntil ? new Date(cooldownUntil).getTime() : 0
  let cooldownActive = Boolean(cooldownUntil && untilMs > now.getTime())
  let msRemaining = cooldownActive ? Math.max(0, untilMs - now.getTime()) : 0

  if (cooldownUntil && !cooldownActive) {
    await admin
      .from("profiles")
      .update({ withdrawal_cooldown_until: null })
      .eq("id", userId)
      .eq("withdrawal_cooldown_until", cooldownUntil)
    cooldownUntil = null
  }

  return {
    consecutiveRejectionsCount,
    cooldownUntil,
    cooldownActive,
    msRemaining,
  }
}

export async function recordWithdrawalApproved(
  admin: SupabaseClient,
  userId: string,
): Promise<void> {
  const { error } = await admin
    .from("profiles")
    .update({ consecutive_rejections_count: 0 })
    .eq("id", userId)
  if (error) throw new Error(error.message)
}

export async function recordWithdrawalRejected(
  admin: SupabaseClient,
  userId: string,
  now = new Date(),
): Promise<WithdrawalRejectionCooldownState> {
  const current = await readWithdrawalRejectionCooldown(admin, userId, now)
  const nextCount = current.consecutiveRejectionsCount + 1

  if (nextCount >= WITHDRAWAL_REJECTION_COOLDOWN_THRESHOLD) {
    const cooldownUntil = new Date(now.getTime() + WITHDRAWAL_REJECTION_COOLDOWN_MS).toISOString()
    const { error } = await admin
      .from("profiles")
      .update({
        consecutive_rejections_count: 0,
        withdrawal_cooldown_until: cooldownUntil,
      })
      .eq("id", userId)
    if (error) throw new Error(error.message)
    return {
      consecutiveRejectionsCount: 0,
      cooldownUntil,
      cooldownActive: true,
      msRemaining: WITHDRAWAL_REJECTION_COOLDOWN_MS,
    }
  }

  const { error } = await admin
    .from("profiles")
    .update({ consecutive_rejections_count: nextCount })
    .eq("id", userId)
  if (error) throw new Error(error.message)

  return {
    consecutiveRejectionsCount: nextCount,
    cooldownUntil: current.cooldownUntil,
    cooldownActive: current.cooldownActive,
    msRemaining: current.msRemaining,
  }
}

/** Admin override — instant retry after ops review. */
export async function clearWithdrawalRejectionCooldown(
  admin: SupabaseClient,
  userId: string,
): Promise<void> {
  const { error } = await admin
    .from("profiles")
    .update({
      withdrawal_cooldown_until: null,
      consecutive_rejections_count: 0,
    })
    .eq("id", userId)
  if (error) throw new Error(error.message)
}

export function formatRejectionCooldownClock(msRemaining: number): string {
  const totalSec = Math.max(0, Math.ceil(msRemaining / 1000))
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":")
}
