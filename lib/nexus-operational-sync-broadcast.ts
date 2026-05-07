/** Cross-tab continuity: other tabs bump operational bootstrap snapshot (cheap re-fetch). */

export const NEXUS_OPERATIONAL_BC = "nexus_operational_sync_v1"

export function broadcastOperationalBump(source?: string): void {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") return
  try {
    const ch = new BroadcastChannel(NEXUS_OPERATIONAL_BC)
    ch.postMessage({ type: "nexus_prefs_bump", source: source ?? "client", ts: Date.now() })
    ch.close()
  } catch {
    /* unsupported / blocked */
  }
}
