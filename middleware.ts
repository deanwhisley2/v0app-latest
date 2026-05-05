import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"

/**
 * When `NEXT_PUBLIC_DEV_LOCAL_ONLY=1`, skip all `/auth/*` screens → dashboard (no login UI).
 */
export function middleware(request: NextRequest) {
  if (process.env.NEXT_PUBLIC_DEV_LOCAL_ONLY !== "1") {
    return NextResponse.next()
  }

  if (request.nextUrl.pathname.startsWith("/auth/")) {
    return NextResponse.redirect(new URL("/dashboard", request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/auth/:path*"],
}
