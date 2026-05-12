import type { NexusNotificationItem } from "@/lib/nexus-notification-models"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function isServerNotificationId(id: string): boolean {
  return UUID_RE.test(id)
}

/** Merge server account rows with local-only rows; single sort by timestamp desc. */
export function mergeServerAccountWithLocals(
  prev: NexusNotificationItem[],
  serverItems: NexusNotificationItem[],
): NexusNotificationItem[] {
  const map = new Map<string, NexusNotificationItem>()
  for (const s of serverItems) map.set(s.id, s)
  for (const p of prev) {
    if (!isServerNotificationId(p.id) && !p.id.startsWith("fin-")) {
      map.set(p.id, p)
    }
  }
  return [...map.values()].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
}

/** Order-independent fingerprint to skip redundant `setInbox` after pull/realtime. */
export function inboxSignature(items: NexusNotificationItem[]): string {
  return [...items]
    .map((i) => `${i.id}:${i.read ? 1 : 0}:${i.timestamp}:${i.title}:${(i.message ?? "").slice(0, 80)}`)
    .sort()
    .join("|")
}

export function sameInboxSignature(a: NexusNotificationItem[], b: NexusNotificationItem[]): boolean {
  return inboxSignature(a) === inboxSignature(b)
}

/** Upsert server rows without dropping other server-backed rows (for realtime deltas). */
export function upsertServerNotificationRows(
  prev: NexusNotificationItem[],
  incoming: NexusNotificationItem[],
): NexusNotificationItem[] {
  const smap = new Map<string, NexusNotificationItem>()
  for (const p of prev) {
    if (isServerNotificationId(p.id) && !p.id.startsWith("fin-")) smap.set(p.id, p)
  }
  for (const row of incoming) {
    if (isServerNotificationId(row.id)) smap.set(row.id, row)
  }
  const locals = prev.filter((p) => !isServerNotificationId(p.id) && !p.id.startsWith("fin-"))
  return [...smap.values(), ...locals].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
}
