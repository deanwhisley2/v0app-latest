import type { User } from "@supabase/supabase-js"
import type { OperationalBootstrapV1 } from "@/lib/operational-bootstrap-types"

const BOOTSTRAP_CACHE_PREFIX = "nexus_op_bootstrap_v1:"

export type OperationalRoleHint = {
  tradingUserLevel: 1 | 2 | 5
  /** True when UI should use desk/admin shell (L5 or L2 credit desk). */
  isOperationalDesk: boolean
  retailerCreditSeller: boolean
  source: "jwt" | "cache" | "snapshot"
}

function jwtTradingLevel(user: User): number {
  const appMeta = user.app_metadata as Record<string, unknown> | undefined
  return Number(appMeta?.trading_user_level ?? 0)
}

export function readOperationalBootstrapCache(userId: string): OperationalBootstrapV1 | null {
  if (typeof window === "undefined") return null
  try {
    const raw = sessionStorage.getItem(`${BOOTSTRAP_CACHE_PREFIX}${userId}`)
    if (!raw) return null
    const parsed = JSON.parse(raw) as OperationalBootstrapV1
    if (parsed?.version !== 1 || parsed.userId !== userId) return null
    return parsed
  } catch {
    return null
  }
}

export function writeOperationalBootstrapCache(snapshot: OperationalBootstrapV1): void {
  if (typeof window === "undefined") return
  try {
    sessionStorage.setItem(`${BOOTSTRAP_CACHE_PREFIX}${snapshot.userId}`, JSON.stringify(snapshot))
  } catch {
    /* quota / private mode */
  }
}

export function clearOperationalBootstrapCache(userId: string): void {
  if (typeof window === "undefined") return
  try {
    sessionStorage.removeItem(`${BOOTSTRAP_CACHE_PREFIX}${userId}`)
  } catch {
    /* ignore */
  }
}

function deskFromLevel(
  level: 1 | 2 | 5,
  retailerCreditSeller: boolean,
  source: OperationalRoleHint["source"],
): OperationalRoleHint {
  const isOperationalDesk = level === 5 || (level === 2 && retailerCreditSeller)
  return { tradingUserLevel: level, isOperationalDesk, retailerCreditSeller, source }
}

/** Fast client hint so L5/L2 desks do not flash the retail trader shell while bootstrap loads. */
export function getOperationalRoleHint(
  user: User | null,
  snapshot: OperationalBootstrapV1 | null,
): OperationalRoleHint | null {
  if (!user) return null

  if (snapshot?.profile?.tradingUserLevel) {
    const level = snapshot.profile.tradingUserLevel
    return deskFromLevel(
      level,
      Boolean(snapshot.profile.retailerCreditSeller),
      "snapshot",
    )
  }

  const cached = readOperationalBootstrapCache(user.id)
  if (cached?.profile?.tradingUserLevel) {
    const level = cached.profile.tradingUserLevel
    return deskFromLevel(
      level,
      Boolean(cached.profile.retailerCreditSeller),
      "cache",
    )
  }

  const jwtLevel = jwtTradingLevel(user)
  if (jwtLevel === 5) return deskFromLevel(5, false, "jwt")
  if (jwtLevel === 2) {
    return deskFromLevel(2, false, "jwt")
  }

  return null
}
