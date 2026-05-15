import type { SupabaseClient } from "@supabase/supabase-js"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { getGovernanceState } from "@/lib/global-execution-governor"
import { getResumeGate } from "@/lib/startup-recovery"
import type { OperationalBootstrapV1, StoredExchangePayload } from "@/lib/operational-bootstrap-types"
import { coerceOperationalPreferences } from "@/lib/operational-preferences-types"
import { coerceExchangeBalancesSnapshot } from "@/lib/exchange-balances-snapshot-types"
import { computeRetailerCreditSeller } from "@/lib/server/security-authz"
import { sumActiveSessionAccrualUsd } from "@/lib/server/container-session-accruals"

export type { OperationalBootstrapV1, StoredExchangePayload } from "@/lib/operational-bootstrap-types"

const PROFILE_SELECT =
  "email, full_name, is_verified, trading_user_level, retailer_credit_seller, funding_country_code, nexus_exchanges, operational_workspace, operational_preferences, nexus_exchange_balances_snapshot, operational_freeze_at, account_disabled_at"

const BALANCE_SELECT =
  "total_earnings, current_stake, available_balance, withdrawal_pending_balance, active_container_earnings, container_withdrawable_earnings, lifetime_container_withdrawn, lifetime_container_fees, last_updated, created_at"

type RawProfile = {
  email?: string
  full_name?: string | null
  is_verified?: boolean
  trading_user_level?: number | string
  retailer_credit_seller?: boolean | null
  funding_country_code?: string | null
  nexus_exchanges?: StoredExchangePayload[] | null
  operational_workspace?: unknown | null
  operational_preferences?: unknown | null
  nexus_exchange_balances_snapshot?: unknown | null
  operational_freeze_at?: string | null
  account_disabled_at?: string | null
}

function normalizeTradingLevel(raw: RawProfile | null): 1 | 2 | 5 {
  const n = Number(raw?.trading_user_level ?? 1)
  if (n === 2 || n === 5) return n
  return 1
}

function isOperationalDeskProfile(
  userId: string,
  raw: RawProfile | null,
  level: 1 | 2 | 5,
): boolean {
  if (level === 5) return true
  if (level === 2) {
    return computeRetailerCreditSeller(userId, raw?.email ?? null, raw?.retailer_credit_seller ?? null)
  }
  return false
}

function buildProfilePayload(
  userId: string,
  raw: RawProfile | null,
  level: 1 | 2 | 5,
): OperationalBootstrapV1["profile"] {
  if (!raw) return null
  const profileExchanges =
    raw.nexus_exchanges && Array.isArray(raw.nexus_exchanges) ? raw.nexus_exchanges : null
  return {
    email: raw.email ?? null,
    fullName: (raw.full_name as string | null) ?? null,
    isVerified: typeof raw.is_verified === "boolean" ? raw.is_verified : null,
    tradingUserLevel: level,
    retailerCreditSeller: computeRetailerCreditSeller(
      userId,
      raw.email ?? null,
      raw.retailer_credit_seller ?? null,
    ),
    fundingCountryCode: raw.funding_country_code ?? null,
    nexus_exchanges: profileExchanges,
  }
}

function buildUserBalancePayload(
  bal: Record<string, unknown> | null,
  sessionAccrual: { combinedUsd: number; copyAccrualUsd: number; fixedPolicyGrossUsd: number },
): OperationalBootstrapV1["userBalance"] {
  if (!bal) return null
  return {
    total_earnings: Number(bal.total_earnings ?? 0),
    current_stake: Number(bal.current_stake ?? 0),
    available_balance: Number(bal.available_balance ?? 0),
    withdrawal_pending_balance: Number((bal as Record<string, unknown>).withdrawal_pending_balance ?? 0),
    active_container_earnings: Number(bal.active_container_earnings ?? 0),
    active_container_earnings_resolved: Number(bal.active_container_earnings ?? 0),
    container_session_accrual_usd: sessionAccrual.combinedUsd,
    container_projected_copy_accrual_usd: sessionAccrual.copyAccrualUsd,
    container_projected_fixed_accrual_usd: sessionAccrual.fixedPolicyGrossUsd,
    container_withdrawable_earnings: Number(bal.container_withdrawable_earnings ?? 0),
    lifetime_container_withdrawn: Number(bal.lifetime_container_withdrawn ?? 0),
    lifetime_container_fees: Number(bal.lifetime_container_fees ?? 0),
    last_updated: (bal.last_updated as string) ?? null,
    created_at: (bal.created_at as string) ?? null,
  }
}

const EMPTY_CONTINUITY: OperationalBootstrapV1["continuity"] = {
  activeSessions: [],
  positionState: [],
  executionState: [],
  cooldownState: [],
  riskStateToday: null,
  daemonSymbolState: [],
  simulationState: [],
  leases: [],
}

/** L5 / retailer desk: skip trader continuity tables (large, unused on ops UI). */
async function buildOperationalBootstrapDeskV1(params: {
  admin: SupabaseClient
  userId: string
  now: string
  rawProfile: RawProfile | null
  level: 1 | 2 | 5
  jwtMetadataExchanges?: unknown
}): Promise<OperationalBootstrapV1> {
  const { admin, userId, now, rawProfile, level } = params

  const metaExchanges = Array.isArray(params.jwtMetadataExchanges)
    ? (params.jwtMetadataExchanges as StoredExchangePayload[])
    : null
  const profileExchanges =
    rawProfile?.nexus_exchanges && Array.isArray(rawProfile.nexus_exchanges)
      ? rawProfile.nexus_exchanges
      : null
  const exchangeConnections = profileExchanges?.length ? profileExchanges : metaExchanges

  const balanceRes = await admin
    .from("user_balances")
    .select(BALANCE_SELECT)
    .eq("user_id", userId)
    .maybeSingle()

  if (balanceRes.error) {
    console.warn("[operational-bootstrap] user_balances (desk):", balanceRes.error.message)
  }

  const bal = balanceRes.data as Record<string, unknown> | null

  return {
    version: 1,
    userId,
    restoredAt: now,
    accountGovernance: {
      operationalFreezeAt: rawProfile?.operational_freeze_at ?? null,
      accountDisabledAt: rawProfile?.account_disabled_at ?? null,
    },
    profile: buildProfilePayload(userId, rawProfile, level),
    userBalance: buildUserBalancePayload(bal, {
      combinedUsd: 0,
      copyAccrualUsd: 0,
      fixedPolicyGrossUsd: 0,
    }),
    exchangeConnections,
    exchangeBalancesSnapshot: coerceExchangeBalancesSnapshot(
      rawProfile?.nexus_exchange_balances_snapshot ?? null,
    ),
    resumeGate: { status: "OPERATIONAL_DESK", unresolvedCount: 0 },
    governance: null,
    continuity: EMPTY_CONTINUITY,
    recentAnalysis: [],
    recentNotifications: [],
    workspaceSnapshot: rawProfile?.operational_workspace ?? null,
    operationalPreferences: coerceOperationalPreferences(rawProfile?.operational_preferences ?? null),
  }
}

export async function buildOperationalBootstrapV1(params: {
  userId: string
  jwtMetadataExchanges?: unknown
}): Promise<OperationalBootstrapV1> {
  const admin = createAdminClient()
  const now = new Date().toISOString()

  const profileRes = await admin
    .from("profiles")
    .select(PROFILE_SELECT)
    .eq("id", params.userId)
    .maybeSingle()

  if (profileRes.error) {
    console.warn("[operational-bootstrap] profiles:", profileRes.error.message)
  }

  const rawProfile = profileRes.data as RawProfile | null
  const level = normalizeTradingLevel(rawProfile)

  if (isOperationalDeskProfile(params.userId, rawProfile, level)) {
    return buildOperationalBootstrapDeskV1({
      admin,
      userId: params.userId,
      now,
      rawProfile,
      level,
      jwtMetadataExchanges: params.jwtMetadataExchanges,
    })
  }

  const [
    balanceRes,
    sessionsRes,
    positionsRes,
    executionRes,
    cooldownRes,
    riskTodayRes,
    daemonRes,
    simRes,
    leasesRes,
    analysisRes,
    notifRes,
    resumeGate,
    governanceState,
  ] = await Promise.all([
    admin.from("user_balances").select(BALANCE_SELECT).eq("user_id", params.userId).maybeSingle(),
    admin
      .from("TradeSession")
      .select("id,symbol,mode,status,totalAmount,usedAmount,startTime,endTime,config")
      .eq("userId", params.userId)
      .in("status", ["PENDING", "ACTIVE"])
      .order("startTime", { ascending: false })
      .limit(200),
    admin
      .from("PositionState")
      .select("userId,symbol,sessionId,status,quantity,entryPrice,updatedAt,version")
      .eq("userId", params.userId)
      .order("updatedAt", { ascending: false })
      .limit(300),
    admin
      .from("ExecutionState")
      .select("sessionId,userId,symbol,status,lastError,reconciliationStatus,lastReconciledAt,version,updatedAt")
      .eq("userId", params.userId)
      .order("updatedAt", { ascending: false })
      .limit(300),
    admin
      .from("CooldownState")
      .select("userId,symbol,cooldownUntil,pauseUntil,lastExecutionAt,updatedAt")
      .eq("userId", params.userId)
      .order("updatedAt", { ascending: false })
      .limit(200),
    admin
      .from("RiskState")
      .select("userId,dayKey,realizedPnlUsd,consecutiveLosses,tradeCount,pauseUntil,updatedAt")
      .eq("userId", params.userId)
      .eq("dayKey", new Date().toISOString().slice(0, 10))
      .maybeSingle(),
    admin
      .from("DaemonSymbolState")
      .select("daemonType,userId,symbol,positionStatus,lastExecutionAt,lastEntryAt,streakAction,streakCount,updatedAt")
      .eq("userId", params.userId)
      .order("updatedAt", { ascending: false })
      .limit(500),
    admin
      .from("SimulationRun")
      .select("id,userId,symbol,createdAt,mode")
      .eq("userId", params.userId)
      .order("createdAt", { ascending: false })
      .limit(50),
    admin.from("OrchestrationLease").select("leaseKey,ownerId,heartbeatAt,expiresAt").limit(200),
    admin
      .from("AnalysisHistory")
      .select("id,symbol,action,confidence,timestamp,tradeExecuted")
      .eq("userId", params.userId)
      .order("timestamp", { ascending: false })
      .limit(40),
    admin
      .from("NotificationRecord")
      .select("id,symbol,action,confidence,read,createdAt")
      .eq("userId", params.userId)
      .eq("deleted", false)
      .order("createdAt", { ascending: false })
      .limit(80),
    (async () => {
      try {
        return await getResumeGate()
      } catch {
        return { status: "EXECUTION_BLOCKED", unresolvedCount: 0, reason: "resume_gate_unavailable" }
      }
    })(),
    (async () => {
      try {
        const g = await getGovernanceState()
        return {
          mode: g.mode,
          healthState: g.healthState,
          marketRegime: g.marketRegime,
          systemicRiskState: g.systemicRiskState,
        }
      } catch {
        return null
      }
    })(),
  ])

  const logWarn = (label: string, err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn(`[operational-bootstrap] ${label}:`, msg)
  }

  if (balanceRes.error) logWarn("user_balances", balanceRes.error.message)
  if (sessionsRes.error) logWarn("TradeSession", sessionsRes.error.message)
  if (positionsRes.error) logWarn("PositionState", positionsRes.error.message)
  if (executionRes.error) logWarn("ExecutionState", executionRes.error.message)
  if (cooldownRes.error) logWarn("CooldownState", cooldownRes.error.message)
  if (riskTodayRes.error) logWarn("RiskState", riskTodayRes.error.message)
  if (daemonRes.error) logWarn("DaemonSymbolState", daemonRes.error.message)
  if (simRes.error) logWarn("SimulationRun", simRes.error.message)
  if (leasesRes.error) logWarn("OrchestrationLease", leasesRes.error.message)
  if (analysisRes.error) logWarn("AnalysisHistory", analysisRes.error.message)
  if (notifRes.error) logWarn("NotificationRecord", notifRes.error.message)

  const metaExchanges = Array.isArray(params.jwtMetadataExchanges)
    ? (params.jwtMetadataExchanges as StoredExchangePayload[])
    : null
  const profileExchanges =
    rawProfile?.nexus_exchanges && Array.isArray(rawProfile.nexus_exchanges)
      ? rawProfile.nexus_exchanges
      : null
  const exchangeConnections = profileExchanges?.length ? profileExchanges : metaExchanges

  const bal = balanceRes.data as Record<string, unknown> | null

  let sessionAccrual = { combinedUsd: 0, copyAccrualUsd: 0, fixedPolicyGrossUsd: 0 }
  if (bal) {
    try {
      sessionAccrual = await sumActiveSessionAccrualUsd(admin, params.userId)
    } catch {
      sessionAccrual = { combinedUsd: 0, copyAccrualUsd: 0, fixedPolicyGrossUsd: 0 }
    }
  }

  return {
    version: 1,
    userId: params.userId,
    restoredAt: now,
    accountGovernance: {
      operationalFreezeAt: rawProfile?.operational_freeze_at ?? null,
      accountDisabledAt: rawProfile?.account_disabled_at ?? null,
    },
    profile: buildProfilePayload(params.userId, rawProfile, level),
    userBalance: buildUserBalancePayload(bal, sessionAccrual),
    exchangeConnections,
    exchangeBalancesSnapshot: coerceExchangeBalancesSnapshot(
      rawProfile?.nexus_exchange_balances_snapshot ?? null,
    ),
    resumeGate,
    governance: governanceState,
    continuity: {
      activeSessions: sessionsRes.error ? [] : sessionsRes.data ?? [],
      positionState: positionsRes.error ? [] : positionsRes.data ?? [],
      executionState: executionRes.error ? [] : executionRes.data ?? [],
      cooldownState: cooldownRes.error ? [] : cooldownRes.data ?? [],
      riskStateToday: riskTodayRes.error ? null : riskTodayRes.data ?? null,
      daemonSymbolState: daemonRes.error ? [] : daemonRes.data ?? [],
      simulationState: simRes.error ? [] : simRes.data ?? [],
      leases: leasesRes.error ? [] : leasesRes.data ?? [],
    },
    recentAnalysis: analysisRes.error ? [] : analysisRes.data ?? [],
    recentNotifications: notifRes.error ? [] : notifRes.data ?? [],
    workspaceSnapshot: rawProfile?.operational_workspace ?? null,
    operationalPreferences: coerceOperationalPreferences(rawProfile?.operational_preferences ?? null),
  }
}
