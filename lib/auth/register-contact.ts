const PHONE_AUTH_EMAIL_DOMAIN = "accounts.nexuspro.it.com"

export function normalizeRegisterPhone(raw: string): string {
  return raw.trim().replace(/\s+/g, "")
}

export function isValidRegisterPhone(raw: string): boolean {
  const digits = raw.replace(/\D/g, "")
  return digits.length >= 9 && digits.length <= 15
}

export function isValidRegisterEmail(raw: string): boolean {
  const trimmed = raw.trim()
  if (!trimmed) return false
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)
}

/** Email is required; phone is optional secondary contact. */
export function validateRegisterContact(emailRaw: string, phoneRaw: string): string | null {
  const email = emailRaw.trim()
  const phone = normalizeRegisterPhone(phoneRaw)
  const hasEmail = isValidRegisterEmail(email)
  const hasPhone = isValidRegisterPhone(phone)
  if (!hasEmail) return "Enter a valid email address."
  if (phone && !hasPhone) return "Enter a valid phone number (at least 9 digits) or leave it blank."
  return null
}

/** Canonical auth email is always the user's real inbox address. */
export function resolveRegisterAuthEmail(emailRaw: string, phoneRaw: string): {
  authEmail: string
  displayEmail: string | null
  phone: string | null
  requiresEmailVerification: boolean
} {
  const email = emailRaw.trim().toLowerCase()
  const phone = normalizeRegisterPhone(phoneRaw)
  const hasPhone = isValidRegisterPhone(phone)

  return {
    authEmail: email,
    displayEmail: email,
    phone: hasPhone ? phone : null,
    requiresEmailVerification: true,
  }
}

export function isInternalPhoneAuthEmail(email: string): boolean {
  return email.trim().toLowerCase().endsWith(`@${PHONE_AUTH_EMAIL_DOMAIN}`)
}
