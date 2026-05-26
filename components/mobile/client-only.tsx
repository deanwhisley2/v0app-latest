"use client"

import { useEffect, useState, type ReactNode } from "react"
import { isAndroidChromeBrowser } from "@/lib/mobile/chrome-android-safe-mode"

type ClientOnlyProps = {
  children: ReactNode
  fallback?: ReactNode
  /** Extra delay after mount (ms) on stock Chrome Android — avoids hydration hard-fail. */
  chromeAndroidDelayMs?: number
}

/**
 * Renders children only after the client has mounted so server HTML always matches
 * the first client paint (null or fallback).
 */
export function ClientOnly({ children, fallback = null, chromeAndroidDelayMs = 0 }: ClientOnlyProps) {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    const delay =
      chromeAndroidDelayMs > 0 && isAndroidChromeBrowser() ? chromeAndroidDelayMs : 0
    const show = () => {
      if (!cancelled) setReady(true)
    }
    if (delay <= 0) {
      show()
      return () => {
        cancelled = true
      }
    }
    const id = window.setTimeout(show, delay)
    return () => {
      cancelled = true
      window.clearTimeout(id)
    }
  }, [chromeAndroidDelayMs])

  if (!ready) return <>{fallback}</>
  return <>{children}</>
}
