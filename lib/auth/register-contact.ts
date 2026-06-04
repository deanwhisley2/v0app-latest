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

/** At least one of phone or email must be present and valid. */
export function validateRegisterContact(emailRaw: string, phoneRaw: string): string | null {
  const email = emailRaw.trim()
  const phone = normalizeRegisterPhone(phoneRaw)
  const hasEmail = isValidRegisterEmail(email)
  const hasPhone = isValidRegisterPhone(phone)
  if (!hasEmail && !hasPhone) {
    return "Enter a valid phone number, email address, or both."
  }
  if (email && !hasEmail) return "Enter a valid email address or leave it blank."
  if (phone && !hasPhone) return "Enter a valid phone number (at least 9 digits)."
  return null
}

/**
 * Supabase Auth requires an email for password signup.
 * Phone-only users get an internal routing address; they sign in with phone via resolveIdentifierToEmail.
 */
export function resolveRegisterAuthEmail(emailRaw: string, phoneRaw: string): {
  authEmail: string
  displayEmail: string | null
  phone: string | null
  requiresEmailVerification: boolean
} {
  const email = emailRaw.trim().toLowerCase()
  const phone = normalizeRegisterPhone(phoneRaw)
  const hasEmail = isValidRegisterEmail(email)
  const hasPhone = isValidRegisterPhone(phone)

  if (hasEmail) {
    return {
      authEmail: email,
      displayEmail: email,
      phone: hasPhone ? phone : null,
      requiresEmailVerification: true,
    }
  }

  const digits = phone.replace(/\D/g, "")
  return {
    authEmail: `p${digits}@${PHONE_AUTH_EMAIL_DOMAIN}`,
    displayEmail: null,
    phone,
    requiresEmailVerification: false,
  }
}

export function isInternalPhoneAuthEmail(email: string): boolean {
  return email.trim().toLowerCase().endsWith(`@${PHONE_AUTH_EMAIL_DOMAIN}`)
}
