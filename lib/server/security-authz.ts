import { createAdminClient } from "@/lib/supabaseAdmin"
import type { User } from "@supabase/supabase-js"

function readAdminIdentitySet(): Set<string> {
  const ids = (process.env.NEXUS_ADMIN_USER_IDS ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean)
  const emails = (process.env.NEXUS_ADMIN_EMAILS ?? "")
    .split(",")
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean)
  return new Set([...ids, ...emails])
}

export function isConfiguredAdminUser(user: User): boolean {
  const adminSet = readAdminIdentitySet()
  if (adminSet.size === 0) return false
  const email = (user.email ?? "").toLowerCase()
  return adminSet.has(user.id) || (email ? adminSet.has(email) : false)
}

export async function getTradingUserLevel(userId: string): Promise<1 | 2 | 5> {
  const admin = createAdminClient()
  const { data } = await admin
    .from("profiles")
    .select("trading_user_level")
    .eq("id", userId)
    .maybeSingle()
  const level = Number(data?.trading_user_level ?? 1)
  if (level === 2 || level === 5) return level
  return 1
}

export async function requireAdminUser(user: User): Promise<void> {
  const level = await getTradingUserLevel(user.id)
  if (level === 5 || isConfiguredAdminUser(user)) return
  throw new Error("Admin access required")
}
