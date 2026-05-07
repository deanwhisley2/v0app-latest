/** Stored in profiles.operational_preferences (merged via API). Version for migrations. */

import type { NexusNotificationItem } from "@/lib/nexus-notification-models"

const ALLOW_TYPES = new Set([
  "price",
  "trade",
  "security",
  "promo",
  "system",
  "analysis",
])

export type OperationalPreferencesV1 = {
  v: 1
  notifications?: {
    inbox: NexusNotificationItem[]
    history: NexusNotificationItem[]
  }
  /** Non-dashboard explorer / panel chrome (incrementally adopted). */
  uiChrome?: Record<string, unknown>
}

const MAX_INBOX = 120
const MAX_HISTORY = 200

function sanitizeItems(items: unknown): NexusNotificationItem[] {
  if (!Array.isArray(items)) return []
  const out: NexusNotificationItem[] = []
  for (const x of items) {
    if (!x || typeof x !== "object") continue
    const n = x as Partial<NexusNotificationItem>
    if (
      typeof n.id !== "string" ||
      typeof n.title !== "string" ||
      typeof n.message !== "string" ||
      typeof n.timestamp !== "string" ||
      typeof n.read !== "boolean" ||
      typeof n.type !== "string"
    )
      continue
    if (!ALLOW_TYPES.has(n.type)) continue
    out.push({
      id: n.id,
      type: n.type as NexusNotificationItem["type"],
      title: n.title.slice(0, 500),
      message: n.message.slice(0, 4000),
      timestamp: n.timestamp,
      read: n.read,
      nav: n.nav,
      analysis: n.analysis,
    })
  }
  return out
}

/** Cap counts for Postgres / payload safety. */
export function normalizeOperationalPreferences(patch: OperationalPreferencesV1): OperationalPreferencesV1 {
  const inbox = sanitizeItems(patch.notifications?.inbox).slice(0, MAX_INBOX)
  const history = sanitizeItems(patch.notifications?.history).slice(0, MAX_HISTORY)
  return {
    v: 1,
    notifications: {
      inbox,
      history,
    },
    ...(patch.uiChrome && typeof patch.uiChrome === "object" ? { uiChrome: clipUiChrome(patch.uiChrome) } : {}),
  }
}

function clipUiChrome(c: Record<string, unknown>): Record<string, unknown> {
  const raw = JSON.stringify(c)
  if (raw.length > 120_000) return { _truncated: true }
  return c
}

export function coerceOperationalPreferences(raw: unknown): OperationalPreferencesV1 | null {
  if (!raw || typeof raw !== "object") return null
  const j = raw as Partial<OperationalPreferencesV1>
  if (j.v !== 1) return null
  return normalizeOperationalPreferences({
    v: 1,
    notifications: j.notifications,
    uiChrome:
      typeof j.uiChrome === "object" && j.uiChrome !== null
        ? (j.uiChrome as Record<string, unknown>)
        : undefined,
  })
}

export function mergeOperationalPreferencesInto(
  existingUnknown: unknown,
  patch: Partial<OperationalPreferencesV1>
): OperationalPreferencesV1 {
  const existing = coerceOperationalPreferences(existingUnknown ?? null)
  const baseNorm = existing
    ? normalizeOperationalPreferences(existing)
    : normalizeOperationalPreferences({ v: 1 })

  let inbox = baseNorm.notifications?.inbox ?? []
  let hist = baseNorm.notifications?.history ?? []
  if (patch.notifications !== undefined) {
    const normalized = normalizeOperationalPreferences({ v: 1, notifications: patch.notifications })
    const nn = normalized.notifications!
    inbox = nn.inbox
    hist = nn.history
  }

  let uiChrome = baseNorm.uiChrome
  if (patch.uiChrome !== undefined && typeof patch.uiChrome === "object") {
    uiChrome = clipUiChrome({ ...(baseNorm.uiChrome ?? {}), ...patch.uiChrome })
  }

  return normalizeOperationalPreferences({
    v: 1,
    notifications: { inbox, history: hist },
    uiChrome,
  })
}
