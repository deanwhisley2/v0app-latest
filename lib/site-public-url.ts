/**
 * Canonical public site origin for share links, referrals, and auth emails.
 * Never use localhost in production-facing URLs.
 */

const CANONICAL_PRODUCTION_ORIGIN = "https://www.nexuspro.it.com"

function stripTrailingSlash(s: string): string {
  return s.replace(/\/+$/, "")
}

function isLocalhostHostname(host: string): boolean {
  const h = host.toLowerCase()
  return h === "localhost" || h === "127.0.0.1" || h === "[::1]" || h.endsWith(".localhost")
}

/** True if the URL's host is localhost / loopback (invalid for public referral links). */
export function isNonPublicSiteUrl(url: string): boolean {
  try {
    return isLocalhostHostname(new URL(url).hostname)
  } catch {
    return true
  }
}

/**
 * Resolve the public browser origin for links sent to users.
 * - Prefer `NEXT_PUBLIC_SITE_URL` when set and not localhost.
 * - Else use the incoming request origin when not localhost.
 * - In production (`NODE_ENV=production`), fall back to canonical VPS domain (never localhost).
 * - In development, allow localhost for local testing.
 */
export function getPublicSiteOrigin(requestUrl?: string | URL | null): string {
  const env = process.env.NEXT_PUBLIC_SITE_URL?.trim()
  if (env && !isNonPublicSiteUrl(env)) {
    return stripTrailingSlash(env)
  }

  if (requestUrl) {
    try {
      const u = typeof requestUrl === "string" ? new URL(requestUrl) : requestUrl
      if (!isLocalhostHostname(u.hostname)) {
        return stripTrailingSlash(`${u.protocol}//${u.host}`)
      }
    } catch {
      /* ignore */
    }
  }

  if (process.env.NODE_ENV === "production") {
    return CANONICAL_PRODUCTION_ORIGIN
  }

  return "http://localhost:3000"
}
