import type { SupabaseClient } from "@supabase/supabase-js"
import { createHash } from "crypto"

export type DeviceLoginGate = {
  allowed: boolean
  requiresVerification: boolean
  reason: string | null
  nextEligibleAt: string | null
}

export function sessionTokenHash(bearerToken: string): string {
  return createHash("sha256").update(bearerToken).digest("hex")
}

/** Block only explicitly revoked/blocked devices; allow multiple phones and browsers. */
export async function evaluateDeviceLoginGate(
  admin: SupabaseClient,
  userId: string,
  bearerToken: string,
): Promise<DeviceLoginGate> {
  const tokenHash = sessionTokenHash(bearerToken)

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

  // Allow concurrent phones/browsers; optional verification is advisory only (no 6h lockout).
  return {
    allowed: true,
    requiresVerification: false,
    reason: null,
    nextEligibleAt: null,
  }
}
