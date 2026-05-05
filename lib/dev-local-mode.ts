/**
 * Localhost-only development: no outbound calls + password-free guest.
 * Set in `.env.local`:
 *
 *   NEXT_PUBLIC_DEV_LOCAL_ONLY=1
 *
 * Remove or set to `0` before staging/production.
 */
export function isDevLocalOnly(): boolean {
  return process.env.NEXT_PUBLIC_DEV_LOCAL_ONLY === "1"
}
