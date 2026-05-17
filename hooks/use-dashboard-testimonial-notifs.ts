"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  canShowMoreTestimonialsToday,
  nextTestimonialDelayMs,
  pickContainerTestimonialLine,
  readDailyTestimonialState,
  recordTestimonialShown,
  resolveViewerUsdAnchor,
  TESTIMONIAL_VISIBILITY_GATE_MS,
} from "@/lib/container-testimonials"

function sessionLoginKey(userId?: string | null) {
  return `nexus_login_testimonial_strip_v2:${userId ?? ""}`
}

function sessionAccumKey(userId?: string | null) {
  return `nexus_dash_visible_ms_v2:${userId ?? ""}`
}

const STRIP_MS = 11_000

type State = {
  visible: boolean
  text: string
}

/**
 * Dashboard bottom testimonial strip — client-only social proof (no server broadcast).
 * Welcome strip after login, then recurring strips after ~14 min visible time, spaced ~28–65 min.
 */
export function useDashboardTestimonialNotifs(opts: {
  enabled: boolean
  userId?: string | null
  formatUserMoney: (amountUsd: number) => string
  /** Liquid USD anchor for relatable amount tiers. */
  viewerUsdAnchor?: number
}) {
  const [state, setState] = useState<State>({ visible: false, text: "" })
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const accumRef = useRef(0)
  const lastTickRef = useRef<number | null>(null)
  const scheduleOpenRef = useRef(false)
  const formatRef = useRef(opts.formatUserMoney)
  formatRef.current = opts.formatUserMoney
  const anchorRef = useRef(opts.viewerUsdAnchor ?? 0)
  anchorRef.current = opts.viewerUsdAnchor ?? 0

  useEffect(() => {
    if (!opts.enabled || !opts.userId) return
    if (typeof opts.viewerUsdAnchor === "number" && opts.viewerUsdAnchor > 0) {
      anchorRef.current = opts.viewerUsdAnchor
      return
    }
    let cancelled = false
    const load = () => {
      fetch("/api/user/balance", { credentials: "include", cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((json) => {
          if (cancelled || !json) return
          anchorRef.current = resolveViewerUsdAnchor({
            mainBalanceUsd: json.available_balance,
            retailBalanceUsd: json.retail_balance,
            activeContainerEarningsUsd: json.active_container_earnings,
          })
        })
        .catch(() => {})
    }
    load()
    const id = window.setInterval(load, 5 * 60 * 1000)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [opts.enabled, opts.userId, opts.viewerUsdAnchor])
  const userIdRef = useRef(opts.userId)
  userIdRef.current = opts.userId

  const dismiss = useCallback(() => {
    setState((s) => (s.visible ? { ...s, visible: false } : s))
  }, [])

  const showOneRef = useRef<() => void>(() => {})

  showOneRef.current = () => {
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return
    if (!canShowMoreTestimonialsToday(userIdRef.current)) return

    const picked = pickContainerTestimonialLine({
      formatUserMoney: formatRef.current,
      userId: userIdRef.current,
      viewerUsdAnchor: anchorRef.current,
    })
    if (!picked) return
    recordTestimonialShown(picked.displayName, userIdRef.current, picked.amountUsd)
    setState({ visible: true, text: picked.line })
    window.setTimeout(() => setState((s) => ({ ...s, visible: false })), STRIP_MS)
  }

  const scheduleNextRef = useRef<() => void>(() => {})
  scheduleNextRef.current = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    if (!canShowMoreTestimonialsToday(userIdRef.current)) return
    const st = readDailyTestimonialState(userIdRef.current)
    const delay = nextTestimonialDelayMs({ shownToday: st.shownCount })
    timeoutRef.current = setTimeout(() => {
      showOneRef.current()
      scheduleNextRef.current()
    }, delay)
  }

  const openSchedule = useCallback(() => {
    if (scheduleOpenRef.current) return
    scheduleOpenRef.current = true
    scheduleNextRef.current()
  }, [])

  useEffect(() => {
    if (!opts.enabled || !opts.userId) return
    const accKey = sessionAccumKey(opts.userId)
    try {
      const raw = sessionStorage.getItem(accKey)
      accumRef.current = raw ? Math.min(Number(raw) || 0, 48 * TESTIMONIAL_VISIBILITY_GATE_MS) : 0
    } catch {
      accumRef.current = 0
    }

    if (accumRef.current >= TESTIMONIAL_VISIBILITY_GATE_MS) {
      openSchedule()
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
      if (!scheduleOpenRef.current && accumRef.current >= TESTIMONIAL_VISIBILITY_GATE_MS) {
        openSchedule()
      }
    }

    const id = window.setInterval(tick, 2000)
    tick()
    return () => window.clearInterval(id)
  }, [opts.enabled, opts.userId, openSchedule])

  useEffect(() => {
    if (!opts.enabled || !opts.userId) return
    const lk = sessionLoginKey(opts.userId)
    try {
      if (sessionStorage.getItem(lk)) return
    } catch {
      return
    }

    const delay = 9_000 + Math.random() * 16_000
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

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [])

  return { ...state, dismiss }
}
