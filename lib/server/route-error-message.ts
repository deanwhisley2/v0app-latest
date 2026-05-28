/** Map thrown values (incl. PostgREST) to a safe user-facing API message. */
export function routeErrorMessage(e: unknown, fallback = "Internal error"): string {
  if (e instanceof Error && e.message.trim()) return e.message.trim()
  if (e && typeof e === "object") {
    const o = e as Record<string, unknown>
    if (typeof o.message === "string" && o.message.trim()) return o.message.trim()
    if (typeof o.details === "string" && o.details.trim()) return o.details.trim()
    if (typeof o.hint === "string" && o.hint.trim()) return o.hint.trim()
  }
  return fallback
}
