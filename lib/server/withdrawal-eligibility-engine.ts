import type { SupabaseClient } from "@supabase/supabase-js"
import { localUnitsToUsd } from "@/lib/nexus-fx"
import { roundUsd2 } from "@/lib/nexus-financial-policy"
import { TRADE_SESSION_OPEN_STATUSES } from "@/lib/nexus-bot/user-session-messaging"
import type { ProfileWithdrawEconomyRow } from "@/lib/server/withdrawal-policy"

/** Active/booked trade stake must exceed this (USD) to unlock zero-reserve withdrawals. */
export const ACTIVE_TRADE_COLLATERAL_THRESHOLD_USD = 10

/** Idle-account minimum retain after withdrawal (USD equivalent for non-UG corridors). */
export const IDLE_SECURITY_RESERVE_USD = 5

/** Idle-account minimum retain for Uganda corridor (UGX, converted to USD for ledger math). */
export const IDLE_SECURITY_RESERVE_UGX = 20_000

export const WITHDRAWAL_ENGAGEMENT_REQUIRED_DAYS = 5

export const WITHDRAWAL_DUAL_SESSION_BLOCK_MESSAGE =
  "Withdrawal requires 5 days of full dual-session trade participation."

export type WithdrawalEligibilityPath = "active_trader" | "idle_account"

export type ResolvedWithdrawalEconomy = {
  path: WithdrawalEligibilityPath
  activeTradeStakeUsd: number
  retainUsd: number
  withdrawableMainUsd: number
  engagementBlocked: boolean
  engagementMessage: string | null
  registrationAgeDays: number
  dualSessionDaysCompleted: number
  uiHint: string
  reserveDisplayLabel: string
}

type TradeSessionEmbed = {
  session_slot?: string
  start_at?: string
}

function embedTradeSession(
  raw: TradeSessionEmbed | TradeSessionEmbed[] | null | undefined,
): TradeSessionEmbed | null {
  if (!raw) return null
  return Array.isArray(raw) ? raw[0] ?? null : raw
}

export function idleSecurityReserveUsd(fundingCountryCode: string | null | undefined): number {
  const cc = String(fundingCountryCode ?? "")
    .trim()
    .toUpperCase()
  if (cc === "UG") {
    return localUnitsToUsd(IDLE_SECURITY_RESERVE_UGX, "UGX") ?? IDLE_SECURITY_RESERVE_USD
  }
  return IDLE_SECURITY_RESERVE_USD
}

export function idleSecurityReserveDisplayLabel(fundingCountryCode: string | null | undefined): string {
  const cc = String(fundingCountryCode ?? "")
    .trim()
    .toUpperCase()
  return cc === "UG" ? "UGX 20,000" : "$5"
}

export async function computeOpenTradeSessionStakeUsd(
  admin: SupabaseClient,
  userId: string,
): Promise<number> {
  const { data, error } = await admin
    .from("nexus_bot_sessions")
    .select("stake_usd")
    .eq("user_id", userId)
    .not("trade_session_id", "is", null)
    .in("status", [...TRADE_SESSION_OPEN_STATUSES])
  if (error) throw new Error(error.message)
  const total = (data ?? []).reduce((sum, row) => sum + Number(row.stake_usd ?? 0), 0)
  return roundUsd2(total)
}

export async function assessDualSessionEngagement(
  admin: SupabaseClient,
  userId: string,
  now = new Date(),
): Promise<{
  ok: boolean
  registrationAgeDays: number
  dualSessionDaysCompleted: number
  message: string | null
}> {
  const { data: profile, error: profileErr } = await admin
    .from("profiles")
    .select("created_at")
    .eq("id", userId)
    .maybeSingle()
  if (profileErr) throw new Error(profileErr.message)

  const createdAt = profile?.created_at ? new Date(String(profile.created_at)) : now
  const registrationAgeDays = Math.max(
    0,
    Math.floor((now.getTime() - createdAt.getTime()) / 86_400_000),
  )

  if (registrationAgeDays < WITHDRAWAL_ENGAGEMENT_REQUIRED_DAYS) {
    return {
      ok: false,
      registrationAgeDays,
      dualSessionDaysCompleted: 0,
      message: WITHDRAWAL_DUAL_SESSION_BLOCK_MESSAGE,
    }
  }

  const lookbackStart = new Date(now)
  lookbackStart.setUTCDate(lookbackStart.getUTCDate() - (WITHDRAWAL_ENGAGEMENT_REQUIRED_DAYS - 1))
  const lookbackIso = lookbackStart.toISOString().slice(0, 10)

  const { data: rows, error } = await admin
    .from("nexus_bot_sessions")
    .select("trade_sessions(session_slot,start_at)")
    .eq("user_id", userId)
    .not("trade_session_id", "is", null)
    .eq("status", "completed")
  if (error) throw new Error(error.message)

  const byDay = new Map<string, Set<string>>()
  for (const row of rows ?? []) {
    const ts = embedTradeSession(row.trade_sessions as TradeSessionEmbed | TradeSessionEmbed[] | null)
    if (!ts?.start_at || !ts.session_slot) continue
    const day = String(ts.start_at).slice(0, 10)
    if (day < lookbackIso) continue
    const slot = String(ts.session_slot).trim().toLowerCase()
    const set = byDay.get(day) ?? new Set<string>()
    set.add(slot)
    byDay.set(day, set)
  }

  for (let offset = 0; offset < WITHDRAWAL_ENGAGEMENT_REQUIRED_DAYS; offset += 1) {
    const day = new Date(now)
    day.setUTCDate(day.getUTCDate() - offset)
    const dayKey = day.toISOString().slice(0, 10)
    const slots = byDay.get(dayKey) ?? new Set<string>()
    if (!slots.has("morning") || !slots.has("evening")) {
      return {
        ok: false,
        registrationAgeDays,
        dualSessionDaysCompleted: offset,
        message: WITHDRAWAL_DUAL_SESSION_BLOCK_MESSAGE,
      }
    }
  }

  return {
    ok: true,
    registrationAgeDays,
    dualSessionDaysCompleted: WITHDRAWAL_ENGAGEMENT_REQUIRED_DAYS,
    message: null,
  }
}

export function buildWithdrawalUiHint(params: {
  path: WithdrawalEligibilityPath
  reserveDisplayLabel: string
}): string {
  if (params.path === "active_trader") {
    return "Available for withdrawal: Full balance (Active trade protection active)."
  }
  return `Available for withdrawal: Balance minus ${params.reserveDisplayLabel} security reserve (Requires 5-day active trade history).`
}

export async function resolveWithdrawalEconomy(
  admin: SupabaseClient,
  userId: string,
  profileRow: ProfileWithdrawEconomyRow | null | undefined,
  availableUsd: number,
  now = new Date(),
): Promise<ResolvedWithdrawalEconomy> {
  const activeTradeStakeUsd = await computeOpenTradeSessionStakeUsd(admin, userId)
  const reserveDisplayLabel = idleSecurityReserveDisplayLabel(profileRow?.funding_country_code)

  if (activeTradeStakeUsd > ACTIVE_TRADE_COLLATERAL_THRESHOLD_USD) {
    return {
      path: "active_trader",
      activeTradeStakeUsd,
      retainUsd: 0,
      withdrawableMainUsd: roundUsd2(Math.max(0, availableUsd)),
      engagementBlocked: false,
      engagementMessage: null,
      registrationAgeDays: 0,
      dualSessionDaysCompleted: 0,
      reserveDisplayLabel,
      uiHint: buildWithdrawalUiHint({ path: "active_trader", reserveDisplayLabel }),
    }
  }

  const engagement = await assessDualSessionEngagement(admin, userId, now)
  const retainUsd = idleSecurityReserveUsd(profileRow?.funding_country_code)

  if (!engagement.ok) {
    return {
      path: "idle_account",
      activeTradeStakeUsd,
      retainUsd,
      withdrawableMainUsd: 0,
      engagementBlocked: true,
      engagementMessage: engagement.message,
      registrationAgeDays: engagement.registrationAgeDays,
      dualSessionDaysCompleted: engagement.dualSessionDaysCompleted,
      reserveDisplayLabel,
      uiHint: buildWithdrawalUiHint({ path: "idle_account", reserveDisplayLabel }),
    }
  }

  return {
    path: "idle_account",
    activeTradeStakeUsd,
    retainUsd,
    withdrawableMainUsd: roundUsd2(Math.max(0, availableUsd - retainUsd)),
    engagementBlocked: false,
    engagementMessage: null,
    registrationAgeDays: engagement.registrationAgeDays,
    dualSessionDaysCompleted: engagement.dualSessionDaysCompleted,
    reserveDisplayLabel,
    uiHint: buildWithdrawalUiHint({ path: "idle_account", reserveDisplayLabel }),
  }
}
