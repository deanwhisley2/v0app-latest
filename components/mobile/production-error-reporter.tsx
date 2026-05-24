"use client"

import { useEffect } from "react"
import { gaEvent } from "@/lib/analytics/google-analytics"
import { isDevLocalOnly } from "@/lib/dev-local-mode"
import { reportClientDiagnostic } from "@/lib/mobile/mobile-navigation-diagnostics"

/** Production client error reporting — GA4 + server diagnostic log. */
export function ProductionErrorReporter() {
  useEffect(() => {
    if (typeof window === "undefined" || isDevLocalOnly()) return

    const onError = (event: ErrorEvent) => {
      const message = String(event.message ?? "unknown").slice(0, 500)
      gaEvent("client_error", {
        message: message.slice(0, 120),
        source: String(event.filename ?? "").slice(0, 80),
        line: event.lineno ?? 0,
      })
      reportClientDiagnostic({
        kind: "window_error",
        message,
        meta: {
          source: event.filename,
          line: event.lineno,
          col: event.colno,
        },
      })
    }

    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason
      const message =
        reason instanceof Error ? reason.message : typeof reason === "string" ? reason : "unhandled_rejection"
      gaEvent("client_unhandled_rejection", { message: message.slice(0, 120) })
      reportClientDiagnostic({
        kind: "unhandled_rejection",
        message: message.slice(0, 500),
        stack: reason instanceof Error ? reason.stack?.slice(0, 800) : undefined,
      })
    }

    window.addEventListener("error", onError)
    window.addEventListener("unhandledrejection", onRejection)
    return () => {
      window.removeEventListener("error", onError)
      window.removeEventListener("unhandledrejection", onRejection)
    }
  }, [])

  return null
}
