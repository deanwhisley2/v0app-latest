import { SITE_BRAND } from "@/lib/site-branding"

export type NativeAlertPayload = {
  title: string
  body: string
  tag?: string
}

export function canUseBrowserNotifications(): boolean {
  return typeof window !== "undefined" && "Notification" in window
}

export async function requestBrowserNotificationPermission(): Promise<NotificationPermission | "unsupported"> {
  if (!canUseBrowserNotifications()) return "unsupported"
  if (Notification.permission === "granted" || Notification.permission === "denied") {
    return Notification.permission
  }
  try {
    return await Notification.requestPermission()
  } catch {
    return "denied"
  }
}

/** Show a native alert when the app is backgrounded — no server push required. */
export function showNativeAlertIfAllowed(payload: NativeAlertPayload): void {
  if (!canUseBrowserNotifications()) return
  if (Notification.permission !== "granted") return
  if (typeof document !== "undefined" && document.visibilityState === "visible") return

  try {
    const n = new Notification(payload.title, {
      body: payload.body,
      tag: payload.tag ?? "nexus-alert",
      icon: `/brand/icons/icon-192.png?v=${SITE_BRAND.assetVersion}`,
      badge: `/brand/icons/icon-192.png?v=${SITE_BRAND.assetVersion}`,
    })
    n.onclick = () => {
      window.focus()
      n.close()
    }
  } catch {
    /* blocked or unsupported */
  }
}
