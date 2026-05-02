import type { SupabaseClient } from "@supabase/supabase-js"

/** Look up auth user id by email (admin API; paginates for small/medium directories). */
export async function findAuthUserIdByEmail(
  admin: SupabaseClient,
  email: string
): Promise<string | null> {
  const normalized = email.trim().toLowerCase()
  let page = 1
  const perPage = 1000

  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage })
    if (error) throw error
    const match = data.users.find((u) => u.email?.toLowerCase() === normalized)
    if (match) return match.id
    if (data.users.length < perPage) return null
    page += 1
    if (page > 50) return null
  }
}
