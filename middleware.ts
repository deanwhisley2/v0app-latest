import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"

/** Total Cookie header above this triggers strip (Chrome / nginx often fail around 8–16KB). */
const COOKIE_HEADER_WARN_BYTES = 6144
/** Supabase chunks JWT across cookies; any single sb-* chunk over this is suspiciously large. */
const SINGLE_SB_COOKIE_MAX_CHARS = 3800

function needsCookieRecovery(request: NextRequest): boolean {
  const cookieHeader = request.headers.get("cookie") ?? ""
  if (cookieHeader.length > COOKIE_HEADER_WARN_BYTES) return true
  for (const c of request.cookies.getAll()) {
    if (c.name.startsWith("sb-") && c.value.length > SINGLE_SB_COOKIE_MAX_CHARS) return true
  }
  return false
}

function buildCookieRecoveryResponse(request: NextRequest) {
  const login = new URL("/auth/login", request.url)
  login.searchParams.set("reason", "session_cleared")
  const res = NextResponse.redirect(login)
  for (const { name } of request.cookies.getAll()) {
    const lower = name.toLowerCase()
    if (
      name.startsWith("sb-") ||
      lower.includes("auth") ||
      lower.includes("token") ||
      lower.includes("session") ||
      lower.includes("sidebar")
    ) {
      res.cookies.set(name, "", { path: "/", maxAge: 0 })
    }
  }
  res.headers.set("x-cookie-recovery", "1")
  res.headers.set("Cache-Control", "no-store")
  return res
}

/**
 * Refresh Supabase auth cookies on each request so App Router Route Handlers
 * (Expert APIs, etc.) see `supabase.auth.getUser()` via `createRouteHandlerSupabaseClient`.
 *
 * When `NEXT_PUBLIC_DEV_LOCAL_ONLY=1`, `/auth/*` still redirects to `/dashboard` (no login UI).
 */
export async function middleware(request: NextRequest) {
  // Strip oversized sessions BEFORE Supabase SSR runs — avoids ERR_RESPONSE_HEADERS_TOO_BIG / 431 loops
  // (e.g. legacy JWT metadata contained multi‑MB base64 selfies).
  if (needsCookieRecovery(request)) {
    return buildCookieRecoveryResponse(request)
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
