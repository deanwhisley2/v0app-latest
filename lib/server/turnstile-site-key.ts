/**
 * Public Turnstile site key for the browser widget.
 * Prefer `TURNSTILE_SITE_KEY` on the server so production can rotate the widget key
 * with only a PM2 restart (no `next build` required). `NEXT_PUBLIC_TURNSTILE_SITE_KEY`
 * still works for local/dev and CI builds that bake the key into the bundle.
 */
export function getTurnstileSiteKey(): string {
  return (
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() ||
    process.env.TURNSTILE_SITE_KEY?.trim() ||
    ""
  )
}
