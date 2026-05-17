import type { NexusNotificationItem } from "@/lib/nexus-notification-models"

const STORAGE_PREFIX = "nexus_notifications_v4"
const LEGACY_GLOBAL_KEY = "nexus_notifications_v3"

export function notificationsStorageKey(userId: string | null, isGuest: boolean): string {
  if (isGuest) return `${STORAGE_PREFIX}:guest`
  if (userId) return `${STORAGE_PREFIX}:${userId}`
  return `${STORAGE_PREFIX}:anonymous`
}

export function loadPersistedNotifications(
  userId: string | null,
  isGuest: boolean,
): { inbox: NexusNotificationItem[]; history: NexusNotificationItem[] } | null {
  if (typeof window === "undefined") return null
  try {
    const raw = localStorage.getItem(notificationsStorageKey(userId, isGuest))
    if (!raw) return null
    const j = JSON.parse(raw) as { inbox?: NexusNotificationItem[]; history?: NexusNotificationItem[] }
    if (!Array.isArray(j.inbox)) return null
    return {
      inbox: j.inbox,
      history: Array.isArray(j.history) ? j.history : [],
    }
  } catch {
    return null
  }
}

export function savePersistedNotifications(
  userId: string | null,
  isGuest: boolean,
  inbox: NexusNotificationItem[],
  history: NexusNotificationItem[],
): void {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(
      notificationsStorageKey(userId, isGuest),
      JSON.stringify({ inbox, history }),
    )
  } catch {
    /* ignore */
  }
}

/** Remove pre–per-user global key so a new login never inherits another account's inbox. */
export function clearLegacyGlobalNotificationStorage(): void {
  if (typeof window === "undefined") return
  try {
    localStorage.removeItem(LEGACY_GLOBAL_KEY)
  } catch {
    /* ignore */
  }
}
