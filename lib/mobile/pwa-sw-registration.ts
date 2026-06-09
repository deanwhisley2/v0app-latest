/**
 * Tap-triggered PWA service worker registration (push-only — no fetch interception).
 * Active only when NEXUS_BROWSER_ONLY_LOCK is false (see pwa-safe-mode.ts).
 */

import { isPwaSafeMode } from "@/lib/mobile/pwa-safe-mode"

export const PWA_SW_URL = "/sw.js"
export const PWA_SW_SCOPE = "/"

export async function registerNexusPushServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return null
  if (isPwaSafeMode()) return null
  try {
    const reg = await navigator.serviceWorker.register(PWA_SW_URL, { scope: PWA_SW_SCOPE })
    if (reg.installing) {
      await new Promise<void>((resolve) => {
        reg.installing!.addEventListener("statechange", () => {
          if (reg.installing?.state === "activated") resolve()
        })
      })
    }
    await navigator.serviceWorker.ready
    return reg
  } catch {
    return null
  }
}

/** Subscribe device to Web Push after SW is active; persists via /api/user/push-subscribe. */
export async function subscribeNexusWebPush(
  token: string,
  audience: "customer" | "admin" | "retailer" = "customer",
): Promise<boolean> {
  if (typeof window === "undefined" || !("PushManager" in window)) return false
  const reg = await registerNexusPushServiceWorker()
  if (!reg?.pushManager) return false

  const keyRes = await fetch("/api/push/vapid-public-key", { cache: "no-store" })
  if (!keyRes.ok) return false
  const { publicKey } = (await keyRes.json()) as { publicKey?: string }
  if (!publicKey) return false

  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    }))

  const body = {
    endpoint: sub.endpoint,
    keys: {
      p256dh: arrayBufferToBase64(sub.getKey("p256dh")),
      auth: arrayBufferToBase64(sub.getKey("auth")),
    },
    audience,
  }

  const res = await fetch("/api/user/push-subscribe", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  return res.ok
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/")
  const raw = atob(base64)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i)
  return out
}

function arrayBufferToBase64(buffer: ArrayBuffer | null): string {
  if (!buffer) return ""
  const bytes = new Uint8Array(buffer)
  let binary = ""
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]!)
  return btoa(binary)
}
