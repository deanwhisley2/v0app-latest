import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

/** Supabase client for App Router Route Handlers (reads/writes auth cookies). */
export async function createRouteHandlerSupabaseClient() {
  const cookieStore = await cookies()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        } catch {
          /* ignore when headers already sent */
        }
      },
    },
  })
}
