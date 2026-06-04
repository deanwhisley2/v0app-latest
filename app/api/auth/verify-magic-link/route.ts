import { NextResponse } from "next/server"
import { externalApisBlockedResponse } from "@/lib/dev-local-api-guard"
import { verifyLoginCodeAndCreateSession } from "@/lib/server/magic-link-auth"
import { getRequestIpAddress, trackLoginSession } from "@/lib/server/login-session"
import { createRouteHandlerSupabaseClient } from "@/lib/supabase/route-handler"

type Body = { email?: string; code?: string; token?: string }

/**
 * POST /api/auth/verify-magic-link
 * Verifies 6-digit email code and writes Supabase auth cookies (SSR session).
 */
export async function POST(request: Request) {
  const blocked = externalApisBlockedResponse()
  if (blocked) return blocked

  let body: Body
  try {
    body = (await request.json()) as Body
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const email = typeof body.email === "string" ? body.email.trim() : ""
  const code = typeof body.code === "string" ? body.code : ""

  if (!email || !code) {
    return NextResponse.json(
      { error: "email and code are required." },
      { status: 400 },
    )
  }

  const result = await verifyLoginCodeAndCreateSession(email, code)
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status },
    )
  }

  try {
    const supabase = await createRouteHandlerSupabaseClient()
    const { data: sessionData } = await supabase.auth.getSession()
    const accessToken = sessionData.session?.access_token
    if (accessToken) {
      const gate = await trackLoginSession({
        userId: result.userId,
        bearerToken: accessToken,
        userAgent: request.headers.get("user-agent") ?? "",
        ipAddress: getRequestIpAddress(request),
      })
      if (!gate.allowed) {
        await supabase.auth.signOut()
        return NextResponse.json(
          { error: gate.reason ?? "Sign-in blocked on this device." },
          { status: 403 },
        )
      }
    }
  } catch (e) {
    console.warn("[verify-magic-link] session track:", e instanceof Error ? e.message : e)
  }

  return NextResponse.json({ ok: true, userId: result.userId })
}
