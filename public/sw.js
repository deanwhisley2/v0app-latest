/* Nexus Pro PWA offline shell — version 20260525 */
const CACHE = "nexus-shell-20260525"
const SHELL = [
  "/offline",
  "/manifest.webmanifest",
  "/brand/icons/icon-192.png",
  "/brand/icons/icon-512.png",
  "/brand/icons/icon-512-maskable.png",
  "/brand/icons/apple-touch-icon.png",
]

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting()
  }
})

self.addEventListener("fetch", (event) => {
  const req = event.request
  if (req.method !== "GET") return

  const url = new URL(req.url)

  if (url.pathname.startsWith("/api/")) return

  if (url.pathname.startsWith("/api/app/android-apk") || url.pathname.endsWith(".apk")) {
    return
  }

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => res)
        .catch(async () => {
          const cache = await caches.open(CACHE)
          return (await cache.match("/offline")) || Response.error()
        }),
    )
    return
  }

  if (
    url.pathname.startsWith("/brand/") ||
    url.pathname.endsWith(".webmanifest") ||
    url.pathname.endsWith(".ico")
  ) {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const cached = await cache.match(req)
        const network = fetch(req)
          .then((res) => {
            if (res.ok) void cache.put(req, res.clone())
            return res
          })
          .catch(() => cached)
        return cached || network
      }),
    )
  }
})
