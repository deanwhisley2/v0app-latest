/* Nexus Pro — minimal install worker (Phase 3). NO fetch handler — browser owns all network/navigation. */
const CACHE = "nexus-install-v20260526"

const PRECACHE = [
  "/offline",
  "/manifest.webmanifest",
  "/brand/icons/icon-192.png",
  "/brand/icons/icon-512.png",
  "/brand/icons/icon-512-maskable.png",
  "/brand/icons/apple-touch-icon.png",
]

function shellUrl(path) {
  return new URL(path, self.location.origin).href
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) =>
        Promise.allSettled(PRECACHE.map((path) => cache.add(shellUrl(path)))),
      )
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
