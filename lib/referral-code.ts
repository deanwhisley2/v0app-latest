import { createHash } from "crypto"

/** Normalize user-facing referral id (alphanumeric, uppercase). */
export function normalizeReferralCodeInput(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
}

/**
 * Deterministic public referral code from user id (stable across sessions).
 * Format: NX + 8 base36 chars — unique index on profiles.referral_code enforces no collisions.
 */
export function referralCodeForUserId(userId: string): string {
  const h = createHash("sha256").update(userId).digest()
  let n = 0n
  for (let i = 0; i < 6; i++) n = (n << 8n) | BigInt(h[i] ?? 0)
  const base36 = n.toString(36).toUpperCase().replace(/[^A-Z0-9]/g, "")
  const tail = (base36 + "00000000").slice(0, 8)
  return `NX${tail}`
}

export function buildRegisterReferralLink(siteUrl: string, referralCode: string): string {
  const base = siteUrl.replace(/\/$/, "")
  return `${base}/auth/register?ref=${encodeURIComponent(referralCode)}`
}
