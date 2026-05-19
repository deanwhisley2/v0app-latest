import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"

/** Total Cookie header above this triggers strip (keep above normal app cookie volume). */
const COOKIE_HEADER_WARN_BYTES = 24 * 1024
/** Supabase chunks JWT across cookies; any single sb-* chunk over this is suspiciously large. */
const SINGLE_SB_COOKIE_MAX_CHARS = 8000
/** Level-2 retailers must not use trading/exchange UIs; they are redirected to the main app (Assets/ops). */
const RETAILER_FORBIDDEN_TRADING_PATHS = ["/trading-workspace", "/war-room", "/analysis", "/race-conditions", "/api-settings"]
const RETAILER_ONLY_PATHS = ["/retailer/dashboard", "/retailer/approvals", "/retailer/history"]
const ADMIN_ONLY_PATHS = ["/admin/treasury", "/admin/users", "/admin/retailers"]
const TRADING_API_PATHS = ["/api/user/fixed-trade", "/api/user/copy-trade", "/api/user/trade-sessions", "/api/trades/record"]

function matchesAnyPath(pathname: string, allowedPrefixes: string[]): boolean {
  return allowedPrefixes.some((p) => pathname.startsWith(p))
}

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
  // Clear all cookies for this host to break persistent header-size loops.
  for (const { name } of request.cookies.getAll()) {
    res.cookies.set(name, "", { path: "/", maxAge: 0 })
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
/** GA4 stream and canonical public site use www — redirect apex host (never leak :3000). */
function wwwCanonicalRedirect(request: NextRequest): NextResponse | null {
  const host = request.headers.get("host")?.split(":")[0]?.toLowerCase() ?? ""
  if (host !== "nexuspro.it.com") return null
  const path = `${request.nextUrl.pathname}${request.nextUrl.search}`
  return NextResponse.redirect(new URL(path, "https://www.nexuspro.it.com"), 308)
}

export async function middleware(request: NextRequest) {
  const wwwRedirect = wwwCanonicalRedirect(request)
  if (wwwRedirect) return wwwRedirect

  const pathname = request.nextUrl.pathname
  const isSessionClearedLogin =
    pathname === "/auth/login" &&
    request.nextUrl.searchParams.get("reason") === "session_cleared"

  // Strip oversized sessions BEFORE Supabase SSR runs — avoids ERR_RESPONSE_HEADERS_TOO_BIG / 431 loops
  // (e.g. legacy JWT metadata contained multi‑MB base64 selfies).
  if (!isSessionClearedLogin && needsCookieRecovery(request)) {
    return buildCookieRecoveryResponse(request)
  }

  if (process.env.NEXT_PUBLIC_DEV_LOCAL_ONLY === "1") {
    if (pathname.startsWith("/auth/")) {
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

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Role-based routing guard: USER vs RETAILER vs ADMIN.
  if (user) {
    let userRole: "USER" | "RETAILER" | "ADMIN" = "USER"
    const jwtLevel = Number(
      (user.app_metadata as Record<string, unknown> | undefined)?.trading_user_level ?? 0
    )
    if (jwtLevel === 5) userRole = "ADMIN"
    else if (jwtLevel === 2) userRole = "RETAILER"
    try {
      const { data: prof } = await supabase
        .from("profiles")
        .select("trading_user_level")
        .eq("id", user.id)
        .maybeSingle()
      const level = Number((prof as { trading_user_level?: number } | null)?.trading_user_level ?? 1)
      if (level === 5) userRole = "ADMIN"
      else if (level === 2) userRole = "RETAILER"
    } catch {
      // Keep request flowing as USER on read failures.
    }

    if (userRole === "RETAILER" && matchesAnyPath(pathname, RETAILER_FORBIDDEN_TRADING_PATHS)) {
      return NextResponse.redirect(new URL("/dashboard", request.url))
    }
    if (userRole === "RETAILER" && matchesAnyPath(pathname, TRADING_API_PATHS)) {
      return NextResponse.json(
        { error: "Retailer accounts are operational liquidity desks and cannot access trading APIs." },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      )
    }
    if (userRole === "ADMIN" && matchesAnyPath(pathname, TRADING_API_PATHS)) {
      return NextResponse.json(
        { error: "Level-5 admin accounts are supervisory and cannot use trading APIs." },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      )
    }
    // Do not hard-block /admin/* by inferred role in middleware.
    // Page-level checks use service-role reads (authoritative) and avoid stale/missing middleware profile reads.
    if (userRole === "USER" && matchesAnyPath(pathname, RETAILER_ONLY_PATHS)) {
      return NextResponse.redirect(new URL("/dashboard", request.url))
    }
  }

  /** Account governance (profiles columns optional until migration). */
  if (user?.id && !request.nextUrl.pathname.startsWith("/auth/account-disabled")) {
    try {
      const path = pathname
      const isAuthPublic =
        path.startsWith("/auth/login") ||
        path.startsWith("/auth/register") ||
        path.startsWith("/auth/recovery") ||
        path.startsWith("/auth/verify") ||
        path.startsWith("/auth/reset-password") ||
        path.startsWith("/api/auth/")

      if (!isAuthPublic) {
        const { data: prof } = await supabase
          .from("profiles")
          .select("account_disabled_at, operational_freeze_at")
          .eq("id", user.id)
          .maybeSingle()
        type ProfG = { account_disabled_at?: string | null; operational_freeze_at?: string | null }
        const p = prof as ProfG | null
        if (p?.account_disabled_at) {
          if (path.startsWith("/api/")) {
            return NextResponse.json(
              { error: "This account has been disabled. Contact support.", code: "ACCOUNT_DISABLED" },
              { status: 403, headers: { "Cache-Control": "no-store" } },
            )
          }
          const res = NextResponse.redirect(new URL("/auth/account-disabled", request.url))
          res.headers.set("Cache-Control", "no-store")
          return res
        }
        if (p?.operational_freeze_at) {
          const frozenExpert =
            path.startsWith("/expert-mode") ||
            path.startsWith("/joelin") ||
            path.startsWith("/bot-commander") ||
            path.startsWith("/api/expert/")
          if (frozenExpert) {
            if (path.startsWith("/api/")) {
              return NextResponse.json(
                {
                  error:
                    "Account frozen: advanced execution and expert APIs are blocked until compliance review completes.",
                  code: "ACCOUNT_FROZEN",
                },
                { status: 403, headers: { "Cache-Control": "no-store" } },
              )
            }
            const dash = NextResponse.redirect(new URL("/dashboard?ops=frozen_advanced", request.url))
            dash.headers.set("Cache-Control", "no-store")
            return dash
          }
        }
      }
    } catch {
      /* keep request flowing if governance columns/policy unavailable */
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
