/* Nexus Pro PWA shell — v20260525d (soft offline copy) */
const CACHE = "nexus-shell-20260525d"

const SHELL_URLS = [
  "/offline",
  "/manifest.webmanifest",
  "/brand/icons/icon-192.png",
  "/brand/icons/icon-512.png",
  "/brand/icons/icon-512-maskable.png",
]

/** Static fallback — must not use Response.error() (Chrome shows "This page couldn't load"). */
const OFFLINE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/>
  <meta name="theme-color" content="#0f7669"/>
  <title>Nexus Pro — Reconnecting</title>
  <style>
    body{margin:0;min-height:100dvh;display:flex;align-items:center;justify-content:center;
      font-family:system-ui,sans-serif;background:#070a12;color:#e8eaef;padding:24px;text-align:center}
    .card{max-width:20rem}
    h1{font-size:1.125rem;margin:0 0 8px}
    p{font-size:0.875rem;color:#9ca3af;margin:0 0 16px;line-height:1.5}
    button,a{display:inline-block;margin:4px;padding:10px 16px;border-radius:8px;font-size:0.875rem;
      font-weight:600;text-decoration:none;cursor:pointer;border:none}
  </style>
</head>
<body>
  <div class="card">
    <h1>Connection interrupted</h1>
    <p>Trying to reconnect… Your workspace will resume automatically.</p>
    <button type="button" onclick="location.reload()">Try again</button>
    <a href="/dashboard" style="background:#0f7669;color:#fff">Open dashboard</a>
  </div>
  <script>window.addEventListener("online",function(){location.reload()})</script>
</body>
</html>`

function shellUrl(path) {
  return new URL(path, self.location.origin).href
}

async function offlineResponse() {
  const cache = await caches.open(CACHE)
  for (const path of ["/offline", "/"]) {
    const hit = await cache.match(shellUrl(path))
    if (hit) return hit
  }
  return new Response(OFFLINE_HTML, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  })
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) =>
        Promise.allSettled(SHELL_URLS.map((path) => cache.add(shellUrl(path)))),
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

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting()
  }
})

self.addEventListener("fetch", (event) => {
  const req = event.request
  if (req.method !== "GET") return

  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return

  if (url.pathname.startsWith("/api/") || url.pathname.endsWith(".apk")) {
    return
  }

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(() => offlineResponse()),
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
        try {
          const res = await fetch(req)
          if (res.ok) void cache.put(req, res.clone())
          return res
        } catch {
          return cached || offlineResponse()
        }
      }),
    )
  }
})
