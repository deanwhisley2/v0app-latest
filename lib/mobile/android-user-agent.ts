/**
 * Server-safe Android UA gate (phase 3 install rebuild).
 * Substring check only — use with request headers on the server, not client navigator.
 */
export function isAndroidUserAgent(userAgent: string | null | undefined): boolean {
  if (!userAgent) return false
  return userAgent.includes("Android")
}
