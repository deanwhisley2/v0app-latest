import { NextResponse } from "next/server"
import { createRouteHandlerSupabaseClient } from "@/lib/supabase/route-handler"
import { ERROR_CODES } from "@/lib/expert/execution-guards"

/**
 * Resolves the signed-in Supabase user for Expert / trading API routes (cookie session).
 * Optional env fallback for integration runners only — set `NEXUS_EXPERT_FALLBACK_USER_ID`
 * to a real `auth.users` UUID if you must call APIs without a browser session (not for production browsers).
 */
export async function requireExpertUserId(): Promise<string | NextResponse> {
  const supabase = await createRouteHandlerSupabaseClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()
  if (error) {
    console.warn("[expert-auth] getUser:", error.message)
  }
  if (user?.id) return user.id

  const fallback = process.env.NEXUS_EXPERT_FALLBACK_USER_ID?.trim()
  if (fallback) return fallback

  return NextResponse.json(
    { code: ERROR_CODES.UNAUTHORIZED, error: "UNAUTHORIZED: Sign in required for Expert trading APIs." },
    { status: 401 }
  )
}
