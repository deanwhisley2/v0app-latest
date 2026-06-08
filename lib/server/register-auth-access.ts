import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * Email stabilization phase: confirm Supabase auth email at register so password login works
 * while profiles.is_verified stays false until the inbox verification code is entered.
 */
export function authEmailConfirmedAtRegister(
  _requiresEmailVerification: boolean,
  _phone: string | null,
): boolean {
  return true
}

/** Allows password sign-in for accounts pending inbox verification (profiles.is_verified false). */
export async function confirmAuthEmailForPasswordLogin(
  admin: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const { error } = await admin.auth.admin.updateUserById(userId, { email_confirm: true })
  if (error) {
    console.warn("[register-auth-access] email_confirm:", error.message)
    return false
  }
  return true
}

/** @deprecated Use confirmAuthEmailForPasswordLogin */
export const confirmAuthEmailForPhonePasswordLogin = confirmAuthEmailForPasswordLogin

/** Internal routing address for phone-only auth users. */
export { phoneAuthEmailFromDigits } from "@/lib/auth/register-contact"
