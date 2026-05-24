/* Nexus Pro PWA shell — v20260526a (safe navigation; auth/network-first bypass) */
const CACHE = "nexus-shell-20260526a"

const SHELL_URLS = [
  "/offline",
  "/manifest.webmanifest",
  "/brand/icons/icon-192.png",
  "/brand/icons/icon-512.png",
  "/brand/icons/icon-512-maskable.png",
]

/** Never use Response.error() — Chrome shows "This page couldn't load". */
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

const NETWORK_ONLY_PREFIXES = [
  "/auth/",
  "/onboarding/",
  "/api/",
  "/_next/",
]

function shellUrl(path) {
  return new URL(path, self.location.origin).href
}

function isNetworkOnlyPath(pathname) {
  return NETWORK_ONLY_PREFIXES.some((prefix) => pathname.startsWith(prefix))
}

function isAppRouterRequest(req) {
  return (
    req.headers.get("RSC") === "1" ||
    req.headers.get("Next-Router-Prefetch") === "1" ||
    req.headers.get("Next-Action") != null ||
    req.headers.get("Next-Router-State-Tree") != null
  )
}

function offlineHtmlResponse() {
  return new Response(OFFLINE_HTML, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  })
}

async function offlineResponse() {
  try {
    const cache = await caches.open(CACHE)
    const offlinePage = await cache.match(shellUrl("/offline"))
    if (offlinePage) return offlinePage
  } catch {
    /* fall through to inline shell */
  }
  return offlineHtmlResponse()
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchNavigationWithRetry(req, attempts) {
  let lastError = null
  for (let i = 0; i < attempts; i += 1) {
    try {
      const res = await fetch(req)
      if (res && (res.ok || res.type === "opaqueredirect" || res.status === 304)) {
        return res
      }
      if (res && res.status >= 300 && res.status < 400) {
        return res
      }
      if (res && res.status >= 400) {
        return res
      }
    } catch (error) {
      lastError = error
      if (i < attempts - 1) {
        await sleep(180 * (i + 1))
      }
    }
  }
  throw lastError || new Error("navigation_failed")
}

async function handleNavigation(req) {
  try {
    return await fetchNavigationWithRetry(req, 2)
  } catch {
    try {
      return await offlineResponse()
    } catch {
      return offlineHtmlResponse()
    }
  }
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

  if (url.pathname.endsWith(".apk")) return

  if (isNetworkOnlyPath(url.pathname) || isAppRouterRequest(req)) {
    return
  }

  if (req.mode === "navigate") {
    event.respondWith(handleNavigation(req))
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
          return cached || offlineHtmlResponse()
        }
      }),
    )
  }
})
