import type { SupabaseClient } from "@supabase/supabase-js"
import { mergeSafeUserMetadata } from "@/lib/server/auth-jwt-metadata"

export const PENDING_VERIFICATION_EMAIL_META_KEY = "pending_verification_email"

export async function markProfilePendingVerificationEmail(
  admin: SupabaseClient,
  userId: string,
  pendingEmail: string,
  existingMeta: Record<string, unknown> = {},
): Promise<void> {
  const normalized = pendingEmail.trim().toLowerCase()
  const { error: profErr } = await admin
    .from("profiles")
    .update({ email: null, is_verified: false, updated_at: new Date().toISOString() })
    .eq("id", userId)
  if (profErr) {
    console.warn("[pending-email] profiles clear:", profErr.message)
  }
  const { error: metaErr } = await admin.auth.admin.updateUserById(userId, {
    user_metadata: mergeSafeUserMetadata(existingMeta, {
      [PENDING_VERIFICATION_EMAIL_META_KEY]: normalized,
    }),
  })
  if (metaErr) {
    console.warn("[pending-email] user_metadata:", metaErr.message)
  }
}

export async function commitVerifiedProfileEmail(
  admin: SupabaseClient,
  userId: string,
  verifiedEmail: string,
): Promise<void> {
  const normalized = verifiedEmail.trim().toLowerCase()
  const { data: authUser } = await admin.auth.admin.getUserById(userId)
  const meta = (authUser.user?.user_metadata ?? {}) as Record<string, unknown>
  const { error: profErr } = await admin
    .from("profiles")
    .update({
      email: normalized,
      is_verified: true,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId)
  if (profErr) {
    console.warn("[pending-email] profiles commit:", profErr.message)
  }
  const { error: metaErr } = await admin.auth.admin.updateUserById(userId, {
    user_metadata: mergeSafeUserMetadata(meta, {
      [PENDING_VERIFICATION_EMAIL_META_KEY]: null,
    }),
  })
  if (metaErr) {
    console.warn("[pending-email] clear metadata:", metaErr.message)
  }
}

export async function userCanAccessWithoutEmailVerification(
  admin: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const { data: prof } = await admin
    .from("profiles")
    .select("is_verified, phone")
    .eq("id", userId)
    .maybeSingle()
  if (prof?.is_verified === true) return true
  if (String(prof?.phone ?? "").trim().length >= 9) return true
  const { data: sec } = await admin
    .from("user_security_profiles")
    .select("security_code_hash")
    .eq("user_id", userId)
    .maybeSingle()
  return Boolean(sec?.security_code_hash)
}
