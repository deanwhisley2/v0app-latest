import type { SupabaseClient } from "@supabase/supabase-js"
import { createHash } from "crypto"

const NEW_DEVICE_COOLDOWN_MS = 6 * 60 * 60 * 1000

export type DeviceLoginGate = {
  allowed: boolean
  requiresVerification: boolean
  reason: string | null
  nextEligibleAt: string | null
}

export function sessionTokenHash(bearerToken: string): string {
  return createHash("sha256").update(bearerToken).digest("hex")
}

/** Enforce 6h between new device sessions; trusted devices skip cooldown. */
export async function evaluateDeviceLoginGate(
  admin: SupabaseClient,
  userId: string,
  bearerToken: string,
): Promise<DeviceLoginGate> {
  const tokenHash = sessionTokenHash(bearerToken)
  const now = Date.now()

  const { data: current, error: curErr } = await admin
    .from("login_sessions")
    .select("id,device_trust,status")
    .eq("user_id", userId)
    .eq("session_token_hash", tokenHash)
    .maybeSingle()
  if (curErr) throw new Error(curErr.message)

  if (current?.device_trust === "blocked" || current?.status === "revoked") {
    return {
      allowed: false,
      requiresVerification: false,
      reason: "This device session is blocked. Sign in from a trusted device or contact support.",
      nextEligibleAt: null,
    }
  }

  if (current?.device_trust === "trusted") {
    return { allowed: true, requiresVerification: false, reason: null, nextEligibleAt: null }
  }

  if (current?.id) {
    return { allowed: true, requiresVerification: false, reason: null, nextEligibleAt: null }
  }

  const since = new Date(now - NEW_DEVICE_COOLDOWN_MS).toISOString()
  const { data: recent, error: recErr } = await admin
    .from("login_sessions")
    .select("id,first_seen_at,session_token_hash,device_trust")
    .eq("user_id", userId)
    .gte("first_seen_at", since)
    .neq("session_token_hash", tokenHash)
    .neq("device_trust", "blocked")
    .order("first_seen_at", { ascending: false })
    .limit(1)
  if (recErr) throw new Error(recErr.message)

  if (recent?.length) {
    const lastAt = new Date(recent[0].first_seen_at as string).getTime()
    const nextEligibleAt = new Date(lastAt + NEW_DEVICE_COOLDOWN_MS).toISOString()
    return {
      allowed: false,
      requiresVerification: true,
      reason:
        "A new device was added recently. For your safety, wait 6 hours or complete email verification before using another device.",
      nextEligibleAt,
    }
  }

  return {
    allowed: true,
    requiresVerification: true,
    reason: "New device detected. Confirm email code to complete sign-in.",
    nextEligibleAt: null,
  }
}
