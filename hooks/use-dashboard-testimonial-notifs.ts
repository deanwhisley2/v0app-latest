"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  nextTestimonialDelayMs,
  pickContainerTestimonialLine,
  readDailyTestimonialState,
  recordTestimonialShown,
} from "@/lib/container-testimonials"

function sessionLoginKey(userId?: string | null) {
  return `nexus_login_testimonial_strip_v1:${userId ?? ""}`
}

function sessionAccumKey(userId?: string | null) {
  return `nexus_dash_visible_ms_v1:${userId ?? ""}`
}
const HOUR_MS = 60 * 60 * 1000
const STRIP_MS = 12_000

type State = {
  visible: boolean
  text: string
}

/**
 * Dashboard-wide bottom testimonial strip: one after login load (tab session),
 * then only after ~1h cumulative visible time on this page, spaced ~40–90 min
 * (compressed toward end of day until 10/day).
 */
export function useDashboardTestimonialNotifs(opts: {
  enabled: boolean
  userId?: string | null
  formatUserMoney: (amountUsd: number) => string
}) {
  const [state, setState] = useState<State>({ visible: false, text: "" })
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const accumRef = useRef(0)
  const lastTickRef = useRef<number | null>(null)
  const hourGateRef = useRef(false)
  const formatRef = useRef(opts.formatUserMoney)
  formatRef.current = opts.formatUserMoney

  const dismiss = useCallback(() => {
    setState((s) => (s.visible ? { ...s, visible: false } : s))
  }, [])

  const showOneRef = useRef<() => void>(() => {})
  const userIdRef = useRef(opts.userId)
  userIdRef.current = opts.userId

  showOneRef.current = () => {
    const picked = pickContainerTestimonialLine({
      formatUserMoney: formatRef.current,
      userId: userIdRef.current,
    })
    if (!picked) return
    recordTestimonialShown(picked.displayName, userIdRef.current)
    setState({ visible: true, text: picked.line })
    window.setTimeout(() => setState((s) => ({ ...s, visible: false })), STRIP_MS)
  }

  const scheduleNextRef = useRef<() => void>(() => {})
  scheduleNextRef.current = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    const st = readDailyTestimonialState(userIdRef.current)
    const delay = nextTestimonialDelayMs({ shownToday: st.shownCount })
    timeoutRef.current = setTimeout(() => {
      showOneRef.current()
      scheduleNextRef.current()
    }, delay)
  }

  const openHourGate = useCallback(() => {
    if (hourGateRef.current) return
    hourGateRef.current = true
    scheduleNextRef.current()
  }, [])

  useEffect(() => {
    if (!opts.enabled || !opts.userId) return
    const accKey = sessionAccumKey(opts.userId)
    try {
      const raw = sessionStorage.getItem(accKey)
      accumRef.current = raw ? Math.min(Number(raw) || 0, 48 * HOUR_MS) : 0
    } catch {
      accumRef.current = 0
    }

    if (accumRef.current >= HOUR_MS) {
      openHourGate()
    }

    const tick = () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") {
        lastTickRef.current = null
        return
      }
      const now = performance.now()
      if (lastTickRef.current == null) {
        lastTickRef.current = now
        return
      }
      const delta = now - lastTickRef.current
      lastTickRef.current = now
      if (delta > 0 && delta < 120_000) {
        accumRef.current += delta
        try {
          sessionStorage.setItem(accKey, String(Math.floor(accumRef.current)))
        } catch {
          /* ignore */
        }
      }
      if (!hourGateRef.current && accumRef.current >= HOUR_MS) {
        openHourGate()
      }
    }

    const id = window.setInterval(tick, 2000)
    tick()
    return () => window.clearInterval(id)
  }, [opts.enabled, opts.userId, openHourGate])

  useEffect(() => {
    if (!opts.enabled || !opts.userId) return
    const lk = sessionLoginKey(opts.userId)
    try {
      if (sessionStorage.getItem(lk)) return
    } catch {
      return
    }

    const delay = 14_000 + Math.random() * 22_000
    const t = window.setTimeout(() => {
      try {
        sessionStorage.setItem(lk, "1")
      } catch {
        /* ignore */
      }
      showOneRef.current()
    }, delay)
    return () => clearTimeout(t)
  }, [opts.enabled, opts.userId])

  /** Second onboarding strip later in the same tab session (dashboard only). */
  useEffect(() => {
    if (!opts.enabled || !opts.userId) return
    const pairKey = `nexus_dash_welcome_second_v1:${opts.userId}`
    try {
      if (sessionStorage.getItem(pairKey)) return
    } catch {
      return
    }

    const delay = 210_000 + Math.random() * 120_000
    const t = window.setTimeout(() => {
      try {
        sessionStorage.setItem(pairKey, "1")
      } catch {
        /* ignore */
      }
      showOneRef.current()
    }, delay)
    return () => clearTimeout(t)
  }, [opts.enabled, opts.userId])

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [])

  return { ...state, dismiss }
}
