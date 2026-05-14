/** Shared types for GET /api/user/operational-bootstrap (no server-only imports). */

import type { NexusExchangeBalancesSnapshotV1 } from "@/lib/exchange-balances-snapshot-types"
import type { OperationalPreferencesV1 } from "@/lib/operational-preferences-types"

export type StoredExchangePayload = Record<string, unknown>

export interface OperationalBootstrapV1 {
  version: 1
  userId: string
  restoredAt: string
  /** Server-side account governance flags (UI surfaces frozen/disabled states). */
  accountGovernance: {
    operationalFreezeAt: string | null
    accountDisabledAt: string | null
  }
  profile: {
    email: string | null
    fullName: string | null
    isVerified: boolean | null
    tradingUserLevel: 1 | 2 | 5
    /** Level-2 retailer desk: sell credits to L1 + fixed trade (up to five accounts). */
    retailerCreditSeller?: boolean
    /** ISO 3166-1 alpha-2 for local retailer matching (profiles.funding_country_code). */
    fundingCountryCode?: string | null
    nexus_exchanges: StoredExchangePayload[] | null
  } | null
  userBalance: {
    total_earnings: number
    current_stake: number
    available_balance: number
    withdrawal_pending_balance?: number
    active_container_earnings?: number
    active_container_earnings_resolved?: number
    container_withdrawable_earnings?: number
    lifetime_container_withdrawn?: number
    lifetime_container_fees?: number
    last_updated: string | null
    created_at: string | null
  } | null
  exchangeConnections: StoredExchangePayload[] | null
  /** profiles.nexus_exchange_balances_snapshot — USD totals for continuity / bots (no secrets). */
  exchangeBalancesSnapshot: NexusExchangeBalancesSnapshotV1 | null
  resumeGate: { status: string; unresolvedCount: number; reason?: string }
  governance: {
    mode: string
    healthState: string
    marketRegime: string
    systemicRiskState: string
  } | null
  continuity: {
    activeSessions: unknown[]
    positionState: unknown[]
    executionState: unknown[]
    cooldownState: unknown[]
    riskStateToday: unknown | null
    daemonSymbolState: unknown[]
    simulationState: unknown[]
    leases: unknown[]
  }
  recentAnalysis: unknown[]
  recentNotifications: unknown[]
  /** profiles.operational_workspace — dashboard / command-center JSON (validated client-side). */
  workspaceSnapshot: unknown | null
  /** profiles.operational_preferences — merged via POST /api/user/operational-preferences */
  operationalPreferences: OperationalPreferencesV1 | null
}
