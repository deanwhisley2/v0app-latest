/**
 * Cloudflare Turnstile server verification.
 * @see https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
 */

const SITE_VERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify"

export function isTurnstileSecretConfigured(): boolean {
  return Boolean(process.env.TURNSTILE_SECRET_KEY?.trim())
}

export function clientIpFromRequest(request: Request): string | null {
  const h = request.headers
  const cf = h.get("cf-connecting-ip")
  if (cf?.trim()) return cf.trim()
  const xff = h.get("x-forwarded-for")
  if (xff) {
    const first = xff.split(",")[0]?.trim()
    if (first) return first
  }
  const real = h.get("x-real-ip")
  if (real?.trim()) return real.trim()
  return null
}

export type TurnstileVerifyResult =
  | { ok: true }
  | { ok: false; error: string; status: number }

/**
 * When `TURNSTILE_SECRET_KEY` is set: requires a non-empty token and validates with Cloudflare.
 * When unset: production returns 503; development skips (local onboarding without keys).
 */
export async function verifyTurnstileForRegister(
  token: string | undefined,
  remoteIp: string | null,
): Promise<TurnstileVerifyResult> {
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim()
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      return {
        ok: false,
        error:
          "Registration verification is not configured on the server (missing TURNSTILE_SECRET_KEY). " +
          "Set TURNSTILE_SECRET_KEY and a site key (TURNSTILE_SITE_KEY or NEXT_PUBLIC_TURNSTILE_SITE_KEY), then restart PM2.",
        status: 503,
      }
    }
    return { ok: true }
  }

  const trimmed = typeof token === "string" ? token.trim() : ""
  if (!trimmed) {
    return { ok: false, error: "Human verification is required.", status: 400 }
  }

  const body = new URLSearchParams({ secret, response: trimmed })
  if (remoteIp) body.set("remoteip", remoteIp)

  let res: Response
  try {
    res = await fetch(SITE_VERIFY, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      cache: "no-store",
    })
  } catch (e) {
    console.warn("[turnstile] siteverify fetch failed:", e instanceof Error ? e.message : String(e))
    return {
      ok: false,
      error: "Could not reach verification service. Try again in a moment.",
      status: 503,
    }
  }

  const data = (await res.json().catch(() => ({}))) as {
    success?: boolean
    "error-codes"?: string[]
  }

  if (!res.ok || !data.success) {
    const codes = (data["error-codes"] ?? []).join(", ") || "unknown"
    console.warn("[turnstile] verify failed:", codes)
    return {
      ok: false,
      error: "Verification failed. Refresh the security check and try again.",
      status: 400,
    }
  }

  return { ok: true }
}
