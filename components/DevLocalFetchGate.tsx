"use client"

import { useEffect } from "react"
import { isDevLocalOnly } from "@/lib/dev-local-mode"

/**
 * When NEXT_PUBLIC_DEV_LOCAL_ONLY=1, block any browser fetch() whose URL is not same-origin
 * (stops direct Binance / etc. calls from client bundles).
 */
export function DevLocalFetchGate() {
  useEffect(() => {
    if (!isDevLocalOnly()) return
    const orig = window.fetch.bind(window)
    window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      const raw =
        typeof input === "string"
          ? input
          : input instanceof Request
            ? input.url
            : String(input)
      try {
        const resolved = new URL(raw, typeof window !== "undefined" ? window.location.origin : "http://localhost")
        if (resolved.origin !== window.location.origin) {
          console.warn("[DEV_LOCAL_ONLY] Blocked external fetch:", resolved.href)
          return Promise.reject(
            new TypeError(`External fetch disabled in local dev: ${resolved.origin}`)
          )
        }
      } catch {
        /* invalid URL — let native fetch decide */
      }
      return orig(input, init)
    }
    return () => {
      window.fetch = orig
    }
  }, [])
  return null
}
