"use client"

import { useEffect } from "react"
import { forceUnlockBodyScroll, getBodyScrollLockCount } from "@/lib/mobile/body-scroll-lock"
import { isNativeMobileScrollMode } from "@/lib/mobile/native-mobile-scroll"

/**
 * Recovers stuck scroll locks after app resume or bfcache restore (common on Samsung A-series).
 */
export function ScrollLockSafety() {
  useEffect(() => {
    const recover = () => {
      if (isNativeMobileScrollMode()) {
        forceUnlockBodyScroll()
        return
      }
      if (getBodyScrollLockCount() > 0) return
      const body = document.body
      const html = document.documentElement
      const stuck =
        body.style.overflow === "hidden" ||
        html.style.overflow === "hidden" ||
        html.classList.contains("nexus-scroll-locked")
      if (stuck) forceUnlockBodyScroll()
    }

    const onVisible = () => {
      if (document.visibilityState === "visible") recover()
    }

    window.addEventListener("pageshow", recover)
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      window.removeEventListener("pageshow", recover)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [])

  return null
}
