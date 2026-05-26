/** User toggles for push + in-app notification categories (stored in operational_preferences.uiChrome). */

export type NotificationChannelKey =
  | "withdraw"
  | "addFunds"
  | "security"
  | "promotions"
  | "tradeUpdates"

export type NotificationChannelPreferences = Record<NotificationChannelKey, boolean>

export const DEFAULT_NOTIFICATION_CHANNELS: NotificationChannelPreferences = {
  withdraw: true,
  addFunds: true,
  security: true,
  promotions: true,
  tradeUpdates: true,
}

const CHANNEL_KEYS: NotificationChannelKey[] = [
  "withdraw",
  "addFunds",
  "security",
  "promotions",
  "tradeUpdates",
]

export function parseNotificationChannels(raw: unknown): NotificationChannelPreferences {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_NOTIFICATION_CHANNELS }
  const o = raw as Record<string, unknown>
  const out = { ...DEFAULT_NOTIFICATION_CHANNELS }
  for (const k of CHANNEL_KEYS) {
    if (typeof o[k] === "boolean") out[k] = o[k]
  }
  return out
}
