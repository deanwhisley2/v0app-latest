import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"

/**
 * Refresh Supabase auth cookies on each request so App Router Route Handlers
 * (Expert APIs, etc.) see `supabase.auth.getUser()` via `createRouteHandlerSupabaseClient`.
 *
 * When `NEXT_PUBLIC_DEV_LOCAL_ONLY=1`, `/auth/*` still redirects to `/dashboard` (no login UI).
 */
export async function middleware(request: NextRequest) {
  const cookieHeader = request.headers.get("cookie") ?? ""
  // Emergency recovery for oversized browser cookies causing 431 / headers-too-big loops.
  if (cookieHeader.length > 12000) {
    const recoveryResponse = NextResponse.next({ request })
    for (const { name } of request.cookies.getAll()) {
      const lower = name.toLowerCase()
      if (
        name.startsWith("sb-") ||
        lower.includes("auth") ||
        lower.includes("token") ||
        lower.includes("session") ||
        lower.includes("sidebar")
      ) {
        recoveryResponse.cookies.set(name, "", { path: "/", maxAge: 0 })
      }
    }
    recoveryResponse.headers.set("x-cookie-recovery", "1")
    return recoveryResponse
  }

  if (process.env.NEXT_PUBLIC_DEV_LOCAL_ONLY === "1") {
    if (request.nextUrl.pathname.startsWith("/auth/")) {
      return NextResponse.redirect(new URL("/dashboard", request.url))
    }
  }

  let supabaseResponse = NextResponse.next({ request })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""
  if (!url.trim() || !anonKey.trim()) {
    return supabaseResponse
  }

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet: Array<{ name: string; value: string; options?: Parameters<typeof supabaseResponse.cookies.set>[2] }>) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        supabaseResponse = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        )
      },
    },
  })

  await supabase.auth.getUser()

  return supabaseResponse
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
