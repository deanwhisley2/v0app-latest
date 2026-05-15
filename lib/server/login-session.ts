import { createHash } from "crypto"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { evaluateDeviceLoginGate, type DeviceLoginGate } from "@/lib/server/device-login-policy"

function parseUserAgent(userAgent: string) {
  const ua = userAgent.toLowerCase()
  let browser = "Unknown browser"
  if (ua.includes("edg/")) browser = "Edge"
  else if (ua.includes("chrome/")) browser = "Chrome"
  else if (ua.includes("firefox/")) browser = "Firefox"
  else if (ua.includes("safari/") && !ua.includes("chrome/")) browser = "Safari"

  let device = "Desktop"
  if (ua.includes("mobile")) device = "Mobile"
  if (ua.includes("tablet")) device = "Tablet"
  return { browser, device }
}

export async function trackLoginSession(params: {
  userId: string
  bearerToken: string
  userAgent: string
  ipAddress: string | null
}): Promise<DeviceLoginGate> {
  const admin = createAdminClient()
  const gate = await evaluateDeviceLoginGate(admin, params.userId, params.bearerToken)
  if (!gate.allowed) return gate

  const tokenHash = createHash("sha256").update(params.bearerToken).digest("hex")
  const { browser, device } = parseUserAgent(params.userAgent)
  const now = new Date().toISOString()

  const { error } = await admin.from("login_sessions").upsert(
    {
      user_id: params.userId,
      session_token_hash: tokenHash,
      browser_name: browser,
      device_name: device,
      user_agent: params.userAgent || null,
      ip_address: params.ipAddress,
      status: "active",
      last_seen_at: now,
    },
    { onConflict: "user_id,session_token_hash" },
  )
  if (error) throw new Error(error.message)
  return gate
}

export function getRequestIpAddress(request: Request): string | null {
  const xff = request.headers.get("x-forwarded-for")
  if (xff) return xff.split(",")[0]?.trim() ?? null
  return request.headers.get("x-real-ip")
}
