"use client"

import { useEffect } from "react"
import { lockBodyScroll } from "@/lib/mobile/body-scroll-lock"

/** Lock document scroll while `active` — safe for nested modals (reference counted). */
export function useBodyScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active) return
    return lockBodyScroll()
  }, [active])
}
