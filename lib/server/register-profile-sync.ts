import type { SupabaseClient } from "@supabase/supabase-js"

/** Persist contact fields before register response so phone login works immediately. */
export async function syncRegisterProfileContact(
  admin: SupabaseClient,
  userId: string,
  params: {
    phone?: string | null
    full_name?: string
    funding_country_code?: string
  },
): Promise<void> {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  const phone = params.phone?.trim()
  if (phone) patch.phone = phone
  if (params.full_name?.trim()) patch.full_name = params.full_name.trim()
  if (params.funding_country_code?.trim()) {
    patch.funding_country_code = params.funding_country_code.trim().toUpperCase().slice(0, 2)
  }
  if (Object.keys(patch).length <= 1) return

  const { error } = await admin.from("profiles").update(patch).eq("id", userId)
  if (error) {
    console.warn("[register-profile-sync]", error.message)
  }
}
