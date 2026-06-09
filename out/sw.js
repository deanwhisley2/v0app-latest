/* Nexus Pro push service worker — NO fetch interception (browser-first routing preserved). */

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting())
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      await self.clients.claim()
    })(),
  )
})

/** Background push from VAPID / cron pipelines (deposits, security, earnings). */
self.addEventListener("push", (event) => {
  event.waitUntil(
    (async () => {
      let payload = { title: "Nexus Pro", body: "You have a new update.", url: "/dashboard", tag: "nexus" }
      try {
        if (event.data) {
          const parsed = event.data.json()
          if (parsed && typeof parsed === "object") payload = { ...payload, ...parsed }
        }
      } catch {
        const text = event.data?.text?.()
        if (text) payload.body = text.slice(0, 240)
      }

      await self.registration.showNotification(payload.title || "Nexus Pro", {
        body: (payload.body || "").slice(0, 240),
        tag: payload.tag || "nexus-push",
        icon: "/brand/icons/icon-192.png",
        badge: "/brand/icons/icon-72.png",
        data: { url: payload.url || "/dashboard" },
        renotify: true,
      })
    })(),
  )
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  const target = event.notification?.data?.url || "/dashboard"
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true })
      for (const client of all) {
        if ("focus" in client) {
          await client.focus()
          if ("navigate" in client && typeof client.navigate === "function") {
            await client.navigate(target)
          }
          return
        }
      }
      await self.clients.openWindow(target)
    })(),
  )
})

/** Client → SW messages (subscription refresh, skipWaiting ack). */
self.addEventListener("message", (event) => {
  const data = event.data
  if (!data || typeof data !== "object") return
  if (data.type === "SKIP_WAITING") {
    void self.skipWaiting()
  }
})
