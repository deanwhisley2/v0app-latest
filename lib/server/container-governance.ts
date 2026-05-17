import type { SupabaseClient } from "@supabase/supabase-js"
import { roundUsd2 } from "@/lib/nexus-financial-policy"
import {
  CONTAINER_COPY_MIN_STAKE_USD,
  CONTAINER_FIX_MIN_PRINCIPAL_USD,
  CONTAINER_FIX_BAND2_VALID_REF_PATH_MIN,
  CONTAINER_FIX_BAND2_WINDOW_DAYS,
  CONTAINER_FIX_BAND2_WINDOW_FUNDING_USD,
  CONTAINER_VALID_REFEREE_MIN_FUNDED_USD,
} from "@/lib/container-policy"
import type { FixTradeRiskLevel } from "@/lib/fix-trade-access"
import {
  getLaunchValidRefereeMinFundedUsd,
  getPlatformLaunchStatus,
} from "@/lib/server/platform-launch"

export type ContainerPersonaRow = {
  id: string
  kind: "copy" | "fix"
  display_name: string
  avatar_initials: string
  win_rate_pct: number | null
  risk_class: FixTradeRiskLevel | null
  monthly_return_pct: number
  speciality: string | null
  description: string | null
  strategies: unknown
  sort_order: number
  active: boolean
  fix_band_required: number
  unlock_rule: string
  unlock_params: Record<string, unknown>
  legacy_ids: string[] | null
}

export type FundingSnapshot = {
  profileCreatedAt: string | null
  lifetimeFundedUsd: number
  fundedInFirstWindowUsd: number
  isAccountFunded: boolean
}

export type ReferralSnapshot = {
  refereeCount: number
  validReferralCount: number
}

export type WithdrawalSignal = {
  hasApprovedWithdrawal: boolean
  lastApprovedAt: string | null
  hasFundingAfterLastWithdrawal: boolean
}

export type FixTenureSignal = {
  hasLongFixCommitment: boolean
}

function daysBetween(a: Date, b: Date): number {
  return Math.floor((a.getTime() - b.getTime()) / (24 * 60 * 60 * 1000))
}

async function sumCompletedFunding(admin: SupabaseClient, userId: string): Promise<number> {
  const { data, error } = await admin
    .from("container_balance_events")
    .select("gross_amount,created_at,category,status")
    .eq("user_id", userId)
    .eq("category", "funding")
  if (error) throw new Error(error.message)
  let sum = 0
  for (const row of data ?? []) {
    if (String((row as { status?: string }).status ?? "completed") !== "completed") continue
    sum += Number((row as { gross_amount?: unknown }).gross_amount ?? 0)
  }
  return roundUsd2(sum)
}

async function sumFundingInWindow(
  admin: SupabaseClient,
  userId: string,
  profileCreatedIso: string | null,
  windowDays: number,
): Promise<number> {
  if (!profileCreatedIso) return 0
  const start = new Date(profileCreatedIso)
  const end = new Date(start.getTime() + windowDays * 24 * 60 * 60 * 1000)
  const { data, error } = await admin
    .from("container_balance_events")
    .select("gross_amount,created_at,category,status")
    .eq("user_id", userId)
    .eq("category", "funding")
  if (error) throw new Error(error.message)
  let sum = 0
  for (const row of data ?? []) {
    if (String((row as { status?: string }).status ?? "completed") !== "completed") continue
    const ts = new Date(String((row as { created_at?: string }).created_at ?? 0))
    if (ts >= start && ts <= end) {
      sum += Number((row as { gross_amount?: unknown }).gross_amount ?? 0)
    }
  }
  return roundUsd2(sum)
}

export async function loadFundingSnapshot(admin: SupabaseClient, userId: string): Promise<FundingSnapshot> {
  const [{ data: profile }, { data: bal }] = await Promise.all([
    admin.from("profiles").select("created_at").eq("id", userId).maybeSingle(),
    admin.from("user_balances").select("available_balance,current_stake").eq("user_id", userId).maybeSingle(),
  ])
  const created = profile?.created_at ? String(profile.created_at) : null
  const av = roundUsd2(Number((bal as { available_balance?: unknown })?.available_balance ?? 0))
  const st = roundUsd2(Number((bal as { current_stake?: unknown })?.current_stake ?? 0))
  const isAccountFunded = av + st > 0.009
  const [lifetimeFundedUsd, fundedInFirstWindowUsd] = await Promise.all([
    sumCompletedFunding(admin, userId),
    sumFundingInWindow(admin, userId, created, CONTAINER_FIX_BAND2_WINDOW_DAYS),
  ])
  return {
    profileCreatedAt: created,
    lifetimeFundedUsd,
    fundedInFirstWindowUsd,
    isAccountFunded,
  }
}

async function refereeIsValid(
  admin: SupabaseClient,
  refereeId: string,
  minFundedUsd: number = CONTAINER_VALID_REFEREE_MIN_FUNDED_USD,
): Promise<boolean> {
  const funded = await sumCompletedFunding(admin, refereeId)
  const { count: fxCount, error: fxErr } = await admin
    .from("fixed_trade_sessions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", refereeId)
  if (fxErr) throw new Error(fxErr.message)
  const hasFix = (fxCount ?? 0) > 0
  return funded >= minFundedUsd && hasFix
}

export async function loadReferralSnapshot(
  admin: SupabaseClient,
  userId: string,
  minFundedUsd: number = CONTAINER_VALID_REFEREE_MIN_FUNDED_USD,
): Promise<ReferralSnapshot> {
  const { data: refs, error } = await admin.from("profiles").select("id").eq("referred_by", userId)
  if (error) throw new Error(error.message)
  const ids = (refs ?? []).map((r: { id: string }) => r.id).filter(Boolean)
  let valid = 0
  for (const rid of ids) {
    if (await refereeIsValid(admin, rid, minFundedUsd)) valid += 1
  }
  return { refereeCount: ids.length, validReferralCount: valid }
}

export async function loadWithdrawalSignals(
  admin: SupabaseClient,
  userId: string,
): Promise<WithdrawalSignal> {
  const { data: rows, error } = await admin
    .from("withdrawal_requests")
    .select("status,reviewed_at,created_at")
    .eq("user_id", userId)
    .eq("status", "approved")
    .order("reviewed_at", { ascending: false })
    .limit(5)
  if (error) throw new Error(error.message)
  const approved = rows ?? []
  const hasApprovedWithdrawal = approved.length > 0
  const lastAtRaw =
    (approved[0] as { reviewed_at?: string | null; created_at?: string })?.reviewed_at ??
    (approved[0] as { created_at?: string })?.created_at ??
    null
  const lastApprovedAt = lastAtRaw ? String(lastAtRaw) : null
  if (!lastApprovedAt) {
    return { hasApprovedWithdrawal, lastApprovedAt: null, hasFundingAfterLastWithdrawal: false }
  }
  const pivot = new Date(lastApprovedAt)
  const { data: fundRows, error: fErr } = await admin
    .from("container_balance_events")
    .select("id")
    .eq("user_id", userId)
    .eq("category", "funding")
    .gt("created_at", pivot.toISOString())
    .limit(1)
  if (fErr) throw new Error(fErr.message)
  return {
    hasApprovedWithdrawal,
    lastApprovedAt,
    hasFundingAfterLastWithdrawal: (fundRows ?? []).length > 0,
  }
}

export async function loadFixTenureSignal(
  admin: SupabaseClient,
  userId: string,
  minPrincipalUsd: number,
  minDays: number,
): Promise<FixTenureSignal> {
  const { data: sessions, error } = await admin
    .from("fixed_trade_sessions")
    .select("principal_amount,created_at,status,cancelled_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(80)
  if (error) throw new Error(error.message)
  const now = new Date()
  for (const s of sessions ?? []) {
    const p = Number((s as { principal_amount?: unknown }).principal_amount ?? 0)
    if (p < minPrincipalUsd) continue
    const created = new Date(String((s as { created_at?: string }).created_at ?? 0))
    const status = String((s as { status?: string }).status ?? "")
    const cancelledAt = (s as { cancelled_at?: string | null }).cancelled_at
    if (status === "active") {
      if (daysBetween(now, created) >= minDays) return { hasLongFixCommitment: true }
    } else if (cancelledAt) {
      const end = new Date(String(cancelledAt))
      if (daysBetween(end, created) >= minDays) return { hasLongFixCommitment: true }
    }
  }
  return { hasLongFixCommitment: false }
}

export async function computeEffectiveFixBandMax(
  admin: SupabaseClient,
  userId: string,
  funding: FundingSnapshot,
  referrals: ReferralSnapshot,
): Promise<1 | 2> {
  const { data: row } = await admin
    .from("user_container_operational")
    .select("fix_band_max")
    .eq("user_id", userId)
    .maybeSingle()
  const persisted = Number((row as { fix_band_max?: unknown })?.fix_band_max ?? 1) >= 2 ? 2 : 1
  const computed =
    funding.fundedInFirstWindowUsd >= CONTAINER_FIX_BAND2_WINDOW_FUNDING_USD ||
    referrals.validReferralCount >= CONTAINER_FIX_BAND2_VALID_REF_PATH_MIN
      ? 2
      : 1
  return Math.max(persisted, computed) as 1 | 2
}

export async function persistFixBandIfEligible(
  admin: SupabaseClient,
  userId: string,
  band: 1 | 2,
): Promise<void> {
  if (band < 2) return
  const nowIso = new Date().toISOString()
  const { data: existing } = await admin
    .from("user_container_operational")
    .select("fix_band_max")
    .eq("user_id", userId)
    .maybeSingle()
  const cur = Number((existing as { fix_band_max?: unknown })?.fix_band_max ?? 1)
  if (cur >= 2) return
  const { error } = await admin.from("user_container_operational").upsert(
    {
      user_id: userId,
      fix_band_max: 2,
      fix_band_2_unlocked_at: nowIso,
      updated_at: nowIso,
    },
    { onConflict: "user_id" },
  )
  if (error) throw new Error(error.message)
}

export async function listPersonas(admin: SupabaseClient): Promise<ContainerPersonaRow[]> {
  const { data, error } = await admin
    .from("container_trader_personas")
    .select(
      "id,kind,display_name,avatar_initials,win_rate_pct,risk_class,monthly_return_pct,speciality,description,strategies,sort_order,active,fix_band_required,unlock_rule,unlock_params,legacy_ids",
    )
    .eq("active", true)
    .order("sort_order", { ascending: true })
  if (error) {
    if (error.message.includes("container_trader_personas") || error.code === "42P01") return []
    throw new Error(error.message)
  }
  return (data ?? []) as ContainerPersonaRow[]
}

export async function resolvePersonaId(
  admin: SupabaseClient,
  rawId: string,
  kind: "copy" | "fix",
): Promise<ContainerPersonaRow | null> {
  const trimmed = rawId.trim()
  if (!trimmed) return null
  const all = await listPersonas(admin)
  const direct = all.find((p) => p.kind === kind && p.id === trimmed)
  if (direct) return direct
  return (
    all.find(
      (p) =>
        p.kind === kind &&
        Array.isArray(p.legacy_ids) &&
        p.legacy_ids.some((x) => String(x).toLowerCase() === trimmed.toLowerCase()),
    ) ?? null
  )
}

type UnlockCtx = {
  funding: FundingSnapshot
  referrals: ReferralSnapshot
  bandMax: 1 | 2
  withdrawal: WithdrawalSignal
  tenure: FixTenureSignal
}

export async function buildUnlockContext(
  admin: SupabaseClient,
  userId: string,
  tenureParams: { minPrincipalUsd: number; minDaysActive: number },
): Promise<UnlockCtx> {
  const funding = await loadFundingSnapshot(admin, userId)
  const launch = await getPlatformLaunchStatus()
  const minRefUsd =
    launch.active && launch.programs.onboarding?.enabled
      ? getLaunchValidRefereeMinFundedUsd(launch.programs, CONTAINER_VALID_REFEREE_MIN_FUNDED_USD)
      : CONTAINER_VALID_REFEREE_MIN_FUNDED_USD
  const referrals = await loadReferralSnapshot(admin, userId, minRefUsd)
  const bandMax = await computeEffectiveFixBandMax(admin, userId, funding, referrals)
  await persistFixBandIfEligible(admin, userId, bandMax)
  const withdrawal = await loadWithdrawalSignals(admin, userId)
  const tenure = await loadFixTenureSignal(admin, userId, tenureParams.minPrincipalUsd, tenureParams.minDaysActive)
  return { funding, referrals, bandMax, withdrawal, tenure }
}

export function personaUnlocked(persona: ContainerPersonaRow, ctx: UnlockCtx): { ok: boolean; reason?: string } {
  if (persona.fix_band_required > ctx.bandMax) {
    return { ok: false, reason: "Advance fixed-trade band (Level 2 structures) is not unlocked yet." }
  }

  const rule = persona.unlock_rule
  const params = persona.unlock_params ?? {}

  if (rule === "none") return { ok: true }

  if (rule === "account_funded") {
    return ctx.funding.isAccountFunded
      ? { ok: true }
      : { ok: false, reason: "Fund Nexus Main to unlock this desk." }
  }

  if (rule === "referrals_min") {
    const min = Number((params as { min?: unknown }).min ?? 0)
    return ctx.referrals.refereeCount >= min
      ? { ok: true }
      : { ok: false, reason: `Requires at least ${min} referred accounts.` }
  }

  if (rule === "referrals_funding_valid") {
    const minRefs = Number((params as { min_referrals?: unknown }).min_referrals ?? 20)
    const minLife = Number((params as { min_lifetime_funding_usd?: unknown }).min_lifetime_funding_usd ?? 40)
    const minRatio = Number((params as { min_valid_ratio?: unknown }).min_valid_ratio ?? 0.5)
    if (ctx.referrals.refereeCount < minRefs) {
      return { ok: false, reason: `Requires at least ${minRefs} referrals.` }
    }
    if (ctx.funding.lifetimeFundedUsd < minLife) {
      return { ok: false, reason: `Requires at least $${minLife} lifetime funding to Nexus Main.` }
    }
    const ratio =
      ctx.referrals.refereeCount > 0 ? ctx.referrals.validReferralCount / ctx.referrals.refereeCount : 0
    return ratio + 1e-9 >= minRatio
      ? { ok: true }
      : {
          ok: false,
          reason: `Requires ≥${Math.round(minRatio * 100)}% valid referees (funded + fixing history).`,
        }
  }

  if (rule === "withdraw_then_fund") {
    if (!ctx.withdrawal.hasApprovedWithdrawal)
      return { ok: false, reason: "Requires a completed withdrawal cycle." }
    return ctx.withdrawal.hasFundingAfterLastWithdrawal
      ? { ok: true }
      : { ok: false, reason: "Requires new Nexus Main funding after your last approved withdrawal." }
  }

  if (rule === "long_fix_commitment") {
    return ctx.tenure.hasLongFixCommitment
      ? { ok: true }
      : { ok: false, reason: "Requires ≥30 days on a ≥$100 fixed allocation." }
  }

  return { ok: true }
}

export function assertCopyStakeUsd(stakeUsd: number): { ok: true } | { ok: false; message: string } {
  if (!Number.isFinite(stakeUsd) || stakeUsd < CONTAINER_COPY_MIN_STAKE_USD) {
    return {
      ok: false,
      message: `Minimum copy-trade allocation is $${CONTAINER_COPY_MIN_STAKE_USD} USD (normalized).`,
    }
  }
  return { ok: true }
}

export function assertFixPrincipalUsd(principalUsd: number): { ok: true } | { ok: false; message: string } {
  if (!Number.isFinite(principalUsd) || principalUsd < CONTAINER_FIX_MIN_PRINCIPAL_USD) {
    return {
      ok: false,
      message: `Minimum fixed-trade principal is $${CONTAINER_FIX_MIN_PRINCIPAL_USD} USD (normalized).`,
    }
  }
  return { ok: true }
}
