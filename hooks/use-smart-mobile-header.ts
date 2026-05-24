"use client"

import { useEffect, useRef, useState } from "react"
import { getBodyScrollLockCount } from "@/lib/mobile/body-scroll-lock"
import { isMobileLowGpuMode } from "@/lib/mobile/mobile-low-gpu-mode"
import { computeSmartHeaderVisibility } from "@/lib/mobile/smart-header-scroll"
import { NEXUS_HEADER_REVEAL } from "@/lib/mobile/mobile-chrome-events"

const MOBILE_MQ = "(max-width: 767px)"

export type SmartMobileHeaderState = {
  enabled: boolean
  visible: boolean
  atTop: boolean
}

/** Passive window scroll listener — reveal header on any upward gesture; no touch interception. */
export function useSmartMobileHeader(): SmartMobileHeaderState {
  const [enabled, setEnabled] = useState(false)
  const [visible, setVisible] = useState(true)
  const [atTop, setAtTop] = useState(true)
  const scrollRef = useRef({ lastY: 0, hidden: false })
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    if (typeof window === "undefined") return
    const mq = window.matchMedia(MOBILE_MQ)
    const syncEnabled = () => setEnabled(mq.matches && !isMobileLowGpuMode())
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

    scrollRef.current.lastY = window.scrollY
    scrollRef.current.hidden = false
    setVisible(true)
    setAtTop(window.scrollY <= 12)

    const onScroll = () => {
      if (getBodyScrollLockCount() > 0) return
      if (rafRef.current != null) return
      rafRef.current = window.requestAnimationFrame(() => {
        rafRef.current = null
        const y = window.scrollY
        const next = computeSmartHeaderVisibility(scrollRef.current, y)
        scrollRef.current = { lastY: next.nextLastY, hidden: next.hidden }
        setAtTop(next.atTop)
        setVisible(!next.hidden)
      })
    }

    window.addEventListener("scroll", onScroll, { passive: true })

    const onReveal = () => {
      scrollRef.current.hidden = false
      setVisible(true)
      setAtTop(window.scrollY <= 12)
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
