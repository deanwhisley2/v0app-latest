"use client"

const PREFS_KEY = "nexus_push_alerts_enabled"

export function isPushAlertsEnabled(): boolean {
  if (typeof window === "undefined") return false
  try {
    return localStorage.getItem(PREFS_KEY) === "1"
  } catch {
    return false
  }
}

export function setPushAlertsEnabled(on: boolean): void {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(PREFS_KEY, on ? "1" : "0")
  } catch {
    /* ignore */
  }
}

export async function ensureNotificationPermission(): Promise<NotificationPermission | "unsupported"> {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported"
  if (Notification.permission === "granted") return "granted"
  if (Notification.permission === "denied") return "denied"
  try {
    return await Notification.requestPermission()
  } catch {
    return "denied"
  }
}

/** Show a native browser notification when permitted (no service worker required). */
export function showBrowserPushAlert(params: {
  title: string
  body: string
  tag?: string
  onClick?: () => void
}): void {
  if (typeof window === "undefined" || !("Notification" in window)) return
  if (!isPushAlertsEnabled()) return
  if (Notification.permission !== "granted") return
  if (document.visibilityState === "visible" && document.hasFocus()) return

  try {
    const n = new Notification(params.title, {
      body: params.body.slice(0, 240),
      tag: params.tag,
      icon: "/icon.png",
    })
    if (params.onClick) {
      n.onclick = () => {
        window.focus()
        params.onClick?.()
        n.close()
      }
    }
  } catch {
    /* ignore — iOS / restricted contexts */
  }
}
