/** Shared types for GET /api/user/operational-bootstrap (no server-only imports). */

import type { OperationalPreferencesV1 } from "@/lib/operational-preferences-types"

export type StoredExchangePayload = Record<string, unknown>

export interface OperationalBootstrapV1 {
  version: 1
  userId: string
  restoredAt: string
  profile: {
    email: string | null
    fullName: string | null
    isVerified: boolean | null
    nexus_exchanges: StoredExchangePayload[] | null
  } | null
  userBalance: {
    total_earnings: number
    current_stake: number
    available_balance: number
    last_updated: string | null
    created_at: string | null
  } | null
  exchangeConnections: StoredExchangePayload[] | null
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
