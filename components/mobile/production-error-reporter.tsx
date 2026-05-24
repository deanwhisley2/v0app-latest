"use client"

import { useEffect } from "react"
import { gaEvent } from "@/lib/analytics/google-analytics"
import { isDevLocalOnly } from "@/lib/dev-local-mode"

/** Production client error reporting — GA4 events, no console spam in prod. */
export function ProductionErrorReporter() {
  useEffect(() => {
    if (typeof window === "undefined" || isDevLocalOnly()) return

    const onError = (event: ErrorEvent) => {
      gaEvent("client_error", {
        message: String(event.message ?? "unknown").slice(0, 120),
        source: String(event.filename ?? "").slice(0, 80),
        line: event.lineno ?? 0,
      })
    }

    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason
      const message =
        reason instanceof Error ? reason.message : typeof reason === "string" ? reason : "unhandled_rejection"
      gaEvent("client_unhandled_rejection", { message: message.slice(0, 120) })
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
