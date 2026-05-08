import { createClient } from "@supabase/supabase-js"

/** Resolve Supabase user from `Authorization: Bearer <access_token>`. */
export function getBearerTokenFromRequest(request: Request): string | null {
  const header = request.headers.get("authorization")
  if (!header?.startsWith("Bearer ")) return null
  const token = header.slice(7).trim()
  return token || null
}

export async function getUserFromBearer(request: Request) {
  const token = getBearerTokenFromRequest(request)
  if (!token) return null

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anon) return null

  const supabase = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token)

  if (error || !user) return null
  return user
}
