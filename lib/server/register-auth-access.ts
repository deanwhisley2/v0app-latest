import type { SupabaseClient } from "@supabase/supabase-js"
import { isValidRegisterPhone, normalizeRegisterPhone } from "@/lib/auth/register-contact"

const PHONE_AUTH_EMAIL_DOMAIN = "accounts.nexuspro.it.com"

/** Supabase password sign-in requires a confirmed auth email; phone registrants may skip inbox verify. */
export function authEmailConfirmedAtRegister(requiresEmailVerification: boolean, phone: string | null): boolean {
  if (!requiresEmailVerification) return true
  return isValidRegisterPhone(normalizeRegisterPhone(phone ?? ""))
}

export async function confirmAuthEmailForPhonePasswordLogin(
  admin: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const { data: prof } = await admin
    .from("profiles")
    .select("phone")
    .eq("id", userId)
    .maybeSingle()
  const digits = String(prof?.phone ?? "").replace(/\D/g, "")
  if (digits.length < 9) return false

  const { error } = await admin.auth.admin.updateUserById(userId, { email_confirm: true })
  if (error) {
    console.warn("[register-auth-access] email_confirm:", error.message)
    return false
  }
  return true
}

/** Internal routing address for phone-only auth users. */
export function phoneAuthEmailFromDigits(digits: string): string {
  return `p${digits}@${PHONE_AUTH_EMAIL_DOMAIN}`
}
