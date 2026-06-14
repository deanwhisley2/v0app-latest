const PHONE_AUTH_EMAIL_DOMAIN = "accounts.nexuspro.it.com"

export function normalizeRegisterPhone(raw: string): string {
  return raw.trim().replace(/\s+/g, "")
}

export function isValidRegisterPhone(raw: string): boolean {
  const digits = raw.replace(/\D/g, "")
  return digits.length >= 9 && digits.length <= 15
}

export function isValidRegisterSecurityPin(raw: string): boolean {
  return /^\d{6}$/.test(raw.trim())
}

/** @deprecated Legacy email register — new signups are phone-only. */
export function isValidRegisterEmail(raw: string): boolean {
  const trimmed = raw.trim()
  if (!trimmed) return false
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)
}

export function isInternalPhoneAuthEmail(email: string): boolean {
  return email.trim().toLowerCase().endsWith(`@${PHONE_AUTH_EMAIL_DOMAIN}`)
}

/** Internal Supabase auth email for phone-only users (shared with server login resolver). */
export function phoneAuthEmailFromDigits(digits: string): string {
  return `p${digits.replace(/\D/g, "")}@${PHONE_AUTH_EMAIL_DOMAIN}`
}

/** Phone-only signup validation (name/password checked in route). */
export function validateRegisterContact(phoneRaw: string, securityPinRaw?: string): string | null {
  if (!isValidRegisterPhone(phoneRaw)) {
    return "Enter a valid phone number (at least 9 digits)."
  }
  if (securityPinRaw !== undefined && !isValidRegisterSecurityPin(securityPinRaw)) {
    return "Security PIN must be exactly 6 digits."
  }
  return null
}

/**
 * Canonical Supabase auth email for phone-only registration.
 * Login resolves the same internal address via phone digits.
 */
export function resolveRegisterAuthEmail(phoneRaw: string): {
  authEmail: string
  phone: string
  requiresEmailVerification: false
} {
  const phone = normalizeRegisterPhone(phoneRaw)
  const digits = phone.replace(/\D/g, "")
  return {
    authEmail: phoneAuthEmailFromDigits(digits),
    phone,
    requiresEmailVerification: false,
  }
}
