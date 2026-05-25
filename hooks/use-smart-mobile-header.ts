"use client"

import { useEffect, useRef, useState } from "react"
import { getBodyScrollLockCount } from "@/lib/mobile/body-scroll-lock"
import { NEXUS_HEADER_REVEAL } from "@/lib/mobile/mobile-chrome-events"
import {
  computeSmartHeaderVisibility,
  shouldRevealSmartHeaderInstantly,
  SMART_HEADER_TOP_ZONE_PX,
} from "@/lib/mobile/smart-header-scroll"

const MOBILE_MQ = "(max-width: 767px)"

export type SmartMobileHeaderState = {
  enabled: boolean
  visible: boolean
  atTop: boolean
}

/**
 * Passive window scroll + rAF — hide on scroll down, instant reveal on any upward delta.
 * No touchmove preventDefault, body lock, or nested scroll owners.
 */
export function useSmartMobileHeader(): SmartMobileHeaderState {
  const [enabled, setEnabled] = useState(false)
  const [visible, setVisible] = useState(true)
  const [atTop, setAtTop] = useState(true)
  const scrollRef = useRef({ lastY: 0, hidden: false })
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    if (typeof window === "undefined") return
    const mq = window.matchMedia(MOBILE_MQ)
    const syncEnabled = () => setEnabled(mq.matches)
    syncEnabled()
    mq.addEventListener("change", syncEnabled)
    return () => mq.removeEventListener("change", syncEnabled)
  }, [])

  useEffect(() => {
    if (!enabled) {
      setVisible(true)
      setAtTop(true)
      scrollRef.current = { lastY: 0, hidden: false }
      return
    }

    const syncFromWindow = () => {
      const y = window.scrollY
      scrollRef.current.lastY = y
      scrollRef.current.hidden = false
      setVisible(true)
      setAtTop(y <= SMART_HEADER_TOP_ZONE_PX)
    }
    syncFromWindow()

    const applyVisibility = (y: number) => {
      const next = computeSmartHeaderVisibility(scrollRef.current, y)
      scrollRef.current = { lastY: next.nextLastY, hidden: next.hidden }
      setAtTop(next.atTop)
      setVisible(!next.hidden)
    }

    const onScroll = () => {
      if (getBodyScrollLockCount() > 0) return
      const y = window.scrollY

      if (shouldRevealSmartHeaderInstantly(scrollRef.current, y)) {
        scrollRef.current.hidden = false
        scrollRef.current.lastY = y
        setVisible(true)
        setAtTop(y <= SMART_HEADER_TOP_ZONE_PX)
        return
      }

      if (rafRef.current != null) return
      rafRef.current = window.requestAnimationFrame(() => {
        rafRef.current = null
        applyVisibility(window.scrollY)
      })
    }

    window.addEventListener("scroll", onScroll, { passive: true })

    const onReveal = () => {
      scrollRef.current.hidden = false
      scrollRef.current.lastY = window.scrollY
      setVisible(true)
      setAtTop(window.scrollY <= SMART_HEADER_TOP_ZONE_PX)
    }
    window.addEventListener(NEXUS_HEADER_REVEAL, onReveal)

    return () => {
      window.removeEventListener("scroll", onScroll)
      window.removeEventListener(NEXUS_HEADER_REVEAL, onReveal)
      if (rafRef.current != null) window.cancelAnimationFrame(rafRef.current)
    }
  }, [enabled])

  return { enabled, visible, atTop }
}
