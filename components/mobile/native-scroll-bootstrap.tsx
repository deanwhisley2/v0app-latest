"use client"

import { useEffect } from "react"
import { forceUnlockBodyScroll } from "@/lib/mobile/body-scroll-lock"
import { isNativeMobileScrollMode } from "@/lib/mobile/native-mobile-scroll"

/** Ensures native scrolling: clear stale locks and mark document for CSS overrides. */
export function NativeScrollBootstrap() {
  useEffect(() => {
    if (!isNativeMobileScrollMode()) return

    const html = document.documentElement
    html.classList.add("nexus-native-scroll")

    const recover = () => {
      forceUnlockBodyScroll()
    }

    recover()
    window.addEventListener("pageshow", recover)
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") recover()
    })

    const interval = window.setInterval(recover, 8000)

    return () => {
      window.clearInterval(interval)
      window.removeEventListener("pageshow", recover)
      document.removeEventListener("visibilitychange", recover)
      html.classList.remove("nexus-native-scroll")
    }
  }, [])

  return null
}
