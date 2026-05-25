/**
 * Temporary mobile routing / hydration failure capture.
 * Remove or gate off after root cause is identified.
 */
export const NEXUS_MOBILE_NAV_DIAGNOSTICS = true

export function isMobileNavDiagnosticsEnabled(): boolean {
  return NEXUS_MOBILE_NAV_DIAGNOSTICS
}

export type ClientDiagnosticKind =
  | "boot"
  | "window_error"
  | "unhandled_rejection"
  | "fetch_fail"
  | "fetch_error"
  | "route_transition"
  | "hydration_hint"
  | "resource_error"
  | "sw_teardown_reload"
  | "history_navigation"
  | "link_click"
  | "tab_change"
  | "touch_tap"
  | "tap_suppressed"
  | "notification_nav"
  | "server_workspace_skip"
  | "overlay_state"
  | "chrome_safe_boot"
  | "chrome_bfcache"
  | "chrome_hydration"
  | "chrome_route"

export type ClientDiagnosticPayload = {
  kind: ClientDiagnosticKind | string
  message: string
  url?: string
  path?: string
  phase?: "pre-hydration" | "client"
  stack?: string
  meta?: Record<string, unknown>
  ts?: number
}

const ENDPOINT = "/api/diagnostics/client-event"
const BUFFER_KEY = "nexus_diag_buffer"
const MAX_BUFFER = 30

function isDebugOverlay(): boolean {
  if (typeof window === "undefined") return false
  try {
    return new URLSearchParams(window.location.search).get("nexus_debug") === "1"
  } catch {
    return false
  }
}

function pushBuffer(payload: ClientDiagnosticPayload): void {
  if (typeof window === "undefined" || !isDebugOverlay()) return
  try {
    const raw = sessionStorage.getItem(BUFFER_KEY)
    const prev = raw ? (JSON.parse(raw) as ClientDiagnosticPayload[]) : []
    prev.push(payload)
    sessionStorage.setItem(BUFFER_KEY, JSON.stringify(prev.slice(-MAX_BUFFER)))
    window.dispatchEvent(new CustomEvent("nexus-diag", { detail: payload }))
  } catch {
    /* ignore */
  }
}

/** Client-side report — safe to call from hooks, effects, and boot scripts. */
export function reportClientDiagnostic(payload: ClientDiagnosticPayload): void {
  if (!isMobileNavDiagnosticsEnabled()) return
  if (typeof window === "undefined") return

  const body: ClientDiagnosticPayload = {
    ...payload,
    url: payload.url ?? window.location.href,
    path: payload.path ?? window.location.pathname,
    ts: payload.ts ?? Date.now(),
    phase: payload.phase ?? "client",
  }

  try {
    console.warn("[nexus-diag]", body.kind, body.message, body.meta ?? {})
  } catch {
    /* ignore */
  }

  pushBuffer(body)

  const json = JSON.stringify(body)
  try {
    if (navigator.sendBeacon) {
      navigator.sendBeacon(ENDPOINT, new Blob([json], { type: "application/json" }))
      return
    }
  } catch {
    /* fall through */
  }

  try {
    void fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: json,
      keepalive: true,
      cache: "no-store",
    })
  } catch {
    /* ignore */
  }
}

export function readDiagnosticBuffer(): ClientDiagnosticPayload[] {
  if (typeof window === "undefined") return []
  try {
    const raw = sessionStorage.getItem(BUFFER_KEY)
    return raw ? (JSON.parse(raw) as ClientDiagnosticPayload[]) : []
  } catch {
    return []
  }
}

/** Runs in <head> before React — must stay self-contained (no imports). */
export const MOBILE_NAV_DIAGNOSTICS_BOOT_SCRIPT = `
(function(){
  try {
    var ENDPOINT = "/api/diagnostics/client-event";
    var BUFFER_KEY = "nexus_diag_buffer";
    var debug = (function(){ try { return new URLSearchParams(location.search).get("nexus_debug") === "1"; } catch(e) { return false; } })();
    function pushBuffer(p) {
      if (!debug) return;
      try {
        var prev = [];
        try { prev = JSON.parse(sessionStorage.getItem(BUFFER_KEY) || "[]"); } catch(e) {}
        prev.push(p);
        sessionStorage.setItem(BUFFER_KEY, JSON.stringify(prev.slice(-30)));
      } catch(e) {}
    }
    function report(kind, message, meta) {
      var payload = {
        kind: kind,
        message: String(message || "").slice(0, 500),
        url: location.href,
        path: location.pathname,
        ts: Date.now(),
        phase: "pre-hydration",
        meta: meta || {}
      };
      try { console.warn("[nexus-diag]", kind, message, meta || {}); } catch(e) {}
      pushBuffer(payload);
      var json = JSON.stringify(payload);
      try {
        if (navigator.sendBeacon) { navigator.sendBeacon(ENDPOINT, new Blob([json], { type: "application/json" })); return; }
      } catch(e) {}
      try {
        fetch(ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json" }, body: json, keepalive: true, cache: "no-store" });
      } catch(e) {}
    }
    window.__nexusDiagReport = report;
    report("boot", "pre-hydration diagnostics active", {
      swController: !!(navigator.serviceWorker && navigator.serviceWorker.controller),
      swCount: 0,
      ua: String(navigator.userAgent || "").slice(0, 160),
      conn: navigator.connection ? navigator.connection.effectiveType : null
    });
    if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
      navigator.serviceWorker.getRegistrations().then(function(regs) {
        report("boot", "service worker registrations", { swCount: regs.length });
      }).catch(function(){});
    }
    window.addEventListener("error", function(e) {
      report("window_error", e.message || "error", { source: e.filename, line: e.lineno, col: e.colno });
    });
    window.addEventListener("unhandledrejection", function(e) {
      var r = e.reason;
      var msg = r && r.message ? r.message : (typeof r === "string" ? r : "unhandled_rejection");
      report("unhandled_rejection", msg, { stack: r && r.stack ? String(r.stack).slice(0, 400) : null });
    });
    window.addEventListener("error", function(e) {
      var t = e.target;
      if (t && (t.tagName === "SCRIPT" || t.tagName === "LINK")) {
        report("resource_error", "failed asset", { tag: t.tagName, src: t.src || t.href || null });
      }
    }, true);
    var origFetch = window.fetch;
    if (origFetch) {
      window.fetch = function(input, init) {
        var url = typeof input === "string" ? input : (input && input.url ? input.url : String(input));
        var isSameOrigin = url.indexOf("http") !== 0 || url.indexOf(location.origin) === 0;
        var isRsc = !!(init && init.headers && (init.headers["RSC"] || init.headers["rsc"] || (init.headers.get && init.headers.get("RSC"))));
        if (!isRsc && url.indexOf("_rsc=") !== -1) isRsc = true;
        return origFetch.apply(this, arguments).then(function(res) {
          if (isSameOrigin && !res.ok) {
            report("fetch_fail", url, { status: res.status, statusText: res.statusText, rsc: isRsc });
          }
          return res;
        }).catch(function(err) {
          if (isSameOrigin) {
            report("fetch_error", url, { err: String(err), rsc: isRsc });
          }
          throw err;
        });
      };
    }
    document.addEventListener("click", function(e) {
      var el = e.target;
      while (el && el !== document) {
        if (el.tagName === "A" && el.href) {
          report("link_click", el.getAttribute("href") || el.href, { absolute: el.href });
          break;
        }
        el = el.parentElement;
      }
    }, true);
  } catch (e) {}
})();
`.trim()
