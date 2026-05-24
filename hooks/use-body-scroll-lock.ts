"use client"

import { useEffect } from "react"
import { lockBodyScroll } from "@/lib/mobile/body-scroll-lock"
import { isNativeMobileScrollMode } from "@/lib/mobile/native-mobile-scroll"

/** Lock document scroll while `active` — no-op in native mobile scroll mode. */
export function useBodyScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active || isNativeMobileScrollMode()) return
    return lockBodyScroll()
  }, [active])
}
