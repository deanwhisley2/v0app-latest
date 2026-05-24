"use client"

import { useEffect, useState } from "react"
import { usePathname, useSearchParams } from "next/navigation"
import {
  isMobileNavDiagnosticsEnabled,
  readDiagnosticBuffer,
  reportClientDiagnostic,
  type ClientDiagnosticPayload,
} from "@/lib/mobile/mobile-navigation-diagnostics"

function useDebugOverlayEnabled(): boolean {
  const searchParams = useSearchParams()
  return searchParams?.get("nexus_debug") === "1"
}

/** Post-hydration route, hydration-hint, and on-screen debug overlay (?nexus_debug=1). */
export function MobileNavigationDiagnostics() {
  const pathname = usePathname()
  const debugOverlay = useDebugOverlayEnabled()
  const [events, setEvents] = useState<ClientDiagnosticPayload[]>([])

  useEffect(() => {
    if (!isMobileNavDiagnosticsEnabled()) return

    const prev = readDiagnosticBuffer()
    if (prev.length) setEvents(prev)

    const onDiag = (e: Event) => {
      const detail = (e as CustomEvent<ClientDiagnosticPayload>).detail
      if (detail) setEvents((cur) => [...cur, detail].slice(-20))
    }
    window.addEventListener("nexus-diag", onDiag)

    const origError = console.error.bind(console)
    console.error = (...args: unknown[]) => {
      const text = args.map((a) => (typeof a === "string" ? a : String(a))).join(" ")
      if (
        text.includes("Hydration") ||
        text.includes("hydration") ||
        text.includes("did not match") ||
        text.includes("Text content does not match")
      ) {
        reportClientDiagnostic({
          kind: "hydration_hint",
          message: text.slice(0, 400),
        })
      }
      origError(...args)
    }

    return () => {
      window.removeEventListener("nexus-diag", onDiag)
      console.error = origError
    }
  }, [])

  useEffect(() => {
    if (!isMobileNavDiagnosticsEnabled() || !pathname) return
    reportClientDiagnostic({
      kind: "route_transition",
      message: pathname,
      path: pathname,
    })
  }, [pathname])

  if (!debugOverlay) return null

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-[9999] max-h-[40vh] overflow-y-auto border-t border-amber-500/40 bg-black/90 p-2 font-mono text-[10px] leading-snug text-amber-100 md:hidden"
      aria-hidden
    >
      <p className="mb-1 font-semibold text-amber-400">nexus_debug — last events</p>
      {events.length === 0 ? (
        <p className="text-amber-200/70">No events yet. Navigate to reproduce the failure.</p>
      ) : (
        <ul className="space-y-1">
          {events
            .slice()
            .reverse()
            .map((ev, i) => (
              <li key={`${ev.ts ?? i}-${ev.kind}`} className="break-all">
                <span className="text-amber-500">{ev.kind}</span> {ev.message}
                {ev.meta && Object.keys(ev.meta).length > 0 ? (
                  <span className="text-amber-200/60"> {JSON.stringify(ev.meta).slice(0, 120)}</span>
                ) : null}
              </li>
            ))}
        </ul>
      )}
    </div>
  )
}
