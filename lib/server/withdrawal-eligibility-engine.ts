import type { SupabaseClient } from "@supabase/supabase-js"
import { localUnitsToUsd } from "@/lib/nexus-fx"
import { roundUsd2 } from "@/lib/nexus-financial-policy"
import { TRADE_SESSION_OPEN_STATUSES } from "@/lib/nexus-bot/user-session-messaging"
import type { ProfileWithdrawEconomyRow } from "@/lib/server/withdrawal-policy"

/** Global alternative-cushion threshold (active trade stake OR Pocket balance). */
export const GLOBAL_CUSHION_THRESHOLD_USD = 10

/** @deprecated Use GLOBAL_CUSHION_THRESHOLD_USD */
export const ACTIVE_TRADE_COLLATERAL_THRESHOLD_USD = GLOBAL_CUSHION_THRESHOLD_USD

/** Account-lifeline minimum retain in Nexus Main after withdrawal (non-UG corridors). */
export const IDLE_SECURITY_RESERVE_USD = 10

/** Account-lifeline minimum retain for Uganda corridor (UGX, converted to USD for ledger math). */
export const IDLE_SECURITY_RESERVE_UGX = 20_000

export const WITHDRAWAL_ENGAGEMENT_REQUIRED_DAYS = 5

export const WITHDRAWAL_DUAL_SESSION_BLOCK_MESSAGE =
  "Withdrawal requires 5 days of full dual-session trade participation."

/** Path A: cushion elsewhere — drain Nexus Main to 0. Path B: account lifeline reserve in Main only. */
export type WithdrawalEligibilityPath = "active_trader" | "idle_account"

export type ResolvedWithdrawalEconomy = {
  path: WithdrawalEligibilityPath
  hasAlternativeCushion: boolean
  activeTradeStakeUsd: number
  pocketBalanceUsd: number
  retainUsd: number
  /** Max gross withdrawal from raw Nexus Main (`available_balance`). */
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

export function hasGlobalAlternativeCushion(params: {
  activeTradeStakeUsd: number
  pocketBalanceUsd: number
}): boolean {
  return (
    params.activeTradeStakeUsd >= GLOBAL_CUSHION_THRESHOLD_USD ||
    params.pocketBalanceUsd >= GLOBAL_CUSHION_THRESHOLD_USD
  )
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
  return cc === "UG" ? "UGX 20,000" : "$10"
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

export async function readPocketBalanceUsd(admin: SupabaseClient, userId: string): Promise<number> {
  const { data, error } = await admin
    .from("user_balances")
    .select("container_withdrawable_earnings")
    .eq("user_id", userId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return roundUsd2(Number(data?.container_withdrawable_earnings ?? 0))
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
  activeTradeStakeUsd?: number
  pocketBalanceUsd?: number
}): string {
  if (params.path === "active_trader") {
    const parts: string[] = []
    if ((params.activeTradeStakeUsd ?? 0) >= GLOBAL_CUSHION_THRESHOLD_USD) {
      parts.push("active trade")
    }
    if ((params.pocketBalanceUsd ?? 0) >= GLOBAL_CUSHION_THRESHOLD_USD) {
      parts.push("Pocket earnings")
    }
    const cushion =
      parts.length > 0 ? parts.join(" and ") : "alternative security cushion"
    return `Available for withdrawal: Full Nexus Main balance (${cushion} hold your security cushion).`
  }
  return `Available for withdrawal: Nexus Main minus ${params.reserveDisplayLabel} lifeline reserve (requires 5-day dual-session trade history).`
}

/**
 * Resolve withdrawal limits from raw Nexus Main only; scans active trade + Pocket for global cushion.
 * @param mainBalanceUsd Raw `user_balances.available_balance` (not net of startup lock).
 */
export async function resolveWithdrawalEconomy(
  admin: SupabaseClient,
  userId: string,
  profileRow: ProfileWithdrawEconomyRow | null | undefined,
  mainBalanceUsd: number,
  now = new Date(),
): Promise<ResolvedWithdrawalEconomy> {
  const [activeTradeStakeUsd, pocketBalanceUsd] = await Promise.all([
    computeOpenTradeSessionStakeUsd(admin, userId),
    readPocketBalanceUsd(admin, userId),
  ])
  const reserveDisplayLabel = idleSecurityReserveDisplayLabel(profileRow?.funding_country_code)
  const hasAlternativeCushion = hasGlobalAlternativeCushion({
    activeTradeStakeUsd,
    pocketBalanceUsd,
  })

  if (hasAlternativeCushion) {
    return {
      path: "active_trader",
      hasAlternativeCushion: true,
      activeTradeStakeUsd,
      pocketBalanceUsd,
      retainUsd: 0,
      withdrawableMainUsd: roundUsd2(Math.max(0, mainBalanceUsd)),
      engagementBlocked: false,
      engagementMessage: null,
      registrationAgeDays: 0,
      dualSessionDaysCompleted: 0,
      reserveDisplayLabel,
      uiHint: buildWithdrawalUiHint({
        path: "active_trader",
        reserveDisplayLabel,
        activeTradeStakeUsd,
        pocketBalanceUsd,
      }),
    }
  }

  const engagement = await assessDualSessionEngagement(admin, userId, now)
  const retainUsd = idleSecurityReserveUsd(profileRow?.funding_country_code)

  if (!engagement.ok) {
    return {
      path: "idle_account",
      hasAlternativeCushion: false,
      activeTradeStakeUsd,
      pocketBalanceUsd,
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
    hasAlternativeCushion: false,
    activeTradeStakeUsd,
    pocketBalanceUsd,
    retainUsd,
    withdrawableMainUsd: roundUsd2(Math.max(0, mainBalanceUsd - retainUsd)),
    engagementBlocked: false,
    engagementMessage: null,
    registrationAgeDays: engagement.registrationAgeDays,
    dualSessionDaysCompleted: engagement.dualSessionDaysCompleted,
    reserveDisplayLabel,
    uiHint: buildWithdrawalUiHint({ path: "idle_account", reserveDisplayLabel }),
  }
}
