/** Client-only persistence so users can return from Gmail without losing verification context. */

import type { VerificationEmailStatus } from "@/lib/auth/verification-email-status"
import { resolveVerificationEmailStatus } from "@/lib/auth/verification-email-status"

export const PENDING_VERIFY_STORAGE_KEY = "nexus_verification_pending_v1"
const LEGACY_SESSION_EMAIL_KEY = "nexus_pending_verify_email"
const LEGACY_SESSION_COUNTRY_KEY = "nexus_pending_verify_country"
const TTL_MS = 24 * 60 * 60 * 1000

export type PendingEmailVerification = {
  verification_pending: true
  email: string
  created_at: number
  funding_country_code?: string
  last_resend_at?: number
  /** When true, reopen on the code-entry step (not only the landing buttons). */
  enter_code_mode?: boolean
  /** Provider could not deliver at signup — account still created. */
  email_delivery_deferred?: boolean
  /** Explicit register send outcome — never treat as sent unless `sent`. */
  verification_email_status?: VerificationEmailStatus
}

function isBrowser(): boolean {
  return typeof window !== "undefined"
}

function parseRecord(raw: string | null): PendingEmailVerification | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<PendingEmailVerification>
    if (parsed.verification_pending !== true) return null
    const email = typeof parsed.email === "string" ? parsed.email.trim() : ""
    const created_at = typeof parsed.created_at === "number" ? parsed.created_at : 0
    if (!email || !email.includes("@") || !created_at) return null
    if (Date.now() - created_at > TTL_MS) return null
    return {
      verification_pending: true,
      email,
      created_at,
      ...(typeof parsed.funding_country_code === "string" && parsed.funding_country_code
        ? { funding_country_code: parsed.funding_country_code.trim().toUpperCase().slice(0, 2) }
        : {}),
      ...(typeof parsed.last_resend_at === "number" ? { last_resend_at: parsed.last_resend_at } : {}),
      ...(parsed.enter_code_mode === true ? { enter_code_mode: true } : {}),
      ...(parsed.email_delivery_deferred === true ? { email_delivery_deferred: true } : {}),
      ...(parsed.verification_email_status === "sent" ||
      parsed.verification_email_status === "delivery_pending" ||
      parsed.verification_email_status === "generation_failed"
        ? { verification_email_status: parsed.verification_email_status }
        : {}),
    }
  } catch {
    return null
  }
}

function readLegacySession(): PendingEmailVerification | null {
  if (!isBrowser()) return null
  try {
    const email = sessionStorage.getItem(LEGACY_SESSION_EMAIL_KEY)?.trim() ?? ""
    if (!email || !email.includes("@")) return null
    const country = sessionStorage.getItem(LEGACY_SESSION_COUNTRY_KEY)?.trim() ?? ""
    return {
      verification_pending: true,
      email,
      created_at: Date.now(),
      ...(country ? { funding_country_code: country } : {}),
    }
  } catch {
    return null
  }
}

export function getPendingEmailVerification(): PendingEmailVerification | null {
  if (!isBrowser()) return null
  try {
    const fromLocal = parseRecord(localStorage.getItem(PENDING_VERIFY_STORAGE_KEY))
    if (fromLocal) return fromLocal
    const legacy = readLegacySession()
    if (legacy) {
      setPendingEmailVerification(legacy)
      return legacy
    }
    return null
  } catch {
    return null
  }
}

export function setPendingEmailVerification(
  input: Omit<PendingEmailVerification, "verification_pending" | "created_at"> & {
    created_at?: number
    verification_pending?: true
  },
): void {
  if (!isBrowser()) return
  const status = resolveVerificationEmailStatus(input)
  const record: PendingEmailVerification = {
    verification_pending: true,
    email: input.email.trim(),
    created_at: input.created_at ?? Date.now(),
    ...(input.funding_country_code
      ? { funding_country_code: input.funding_country_code.trim().toUpperCase().slice(0, 2) }
      : {}),
    ...(typeof input.last_resend_at === "number" ? { last_resend_at: input.last_resend_at } : {}),
    ...(input.enter_code_mode === true ? { enter_code_mode: true } : {}),
    verification_email_status: status,
    email_delivery_deferred: status !== "sent",
  }
  try {
    localStorage.setItem(PENDING_VERIFY_STORAGE_KEY, JSON.stringify(record))
    sessionStorage.setItem(LEGACY_SESSION_EMAIL_KEY, record.email)
    if (record.funding_country_code) {
      sessionStorage.setItem(LEGACY_SESSION_COUNTRY_KEY, record.funding_country_code)
    }
  } catch {
    /* ignore quota / private mode */
  }
}

export function patchPendingEmailVerification(
  patch: Partial<
    Pick<
      PendingEmailVerification,
      "enter_code_mode" | "last_resend_at" | "email" | "email_delivery_deferred" | "verification_email_status"
    >
  >,
): void {
  const current = getPendingEmailVerification()
  if (!current) return
  const merged = { ...current, ...patch }
  const status = resolveVerificationEmailStatus(merged)
  setPendingEmailVerification({
    ...merged,
    verification_email_status: status,
    email_delivery_deferred: status !== "sent",
  })
}

export function clearPendingEmailVerification(): void {
  if (!isBrowser()) return
  try {
    localStorage.removeItem(PENDING_VERIFY_STORAGE_KEY)
    sessionStorage.removeItem(LEGACY_SESSION_EMAIL_KEY)
    sessionStorage.removeItem(LEGACY_SESSION_COUNTRY_KEY)
  } catch {
    /* ignore */
  }
}

export const VERIFICATION_RESEND_COOLDOWN_MS = 60_000

export function getResendCooldownRemainingMs(lastResendAt?: number): number {
  if (!lastResendAt) return 0
  const elapsed = Date.now() - lastResendAt
  return Math.max(0, VERIFICATION_RESEND_COOLDOWN_MS - elapsed)
}

export function recordVerificationResendSent(): void {
  const pending = getPendingEmailVerification()
  if (!pending) return
  patchPendingEmailVerification({ last_resend_at: Date.now() })
}
