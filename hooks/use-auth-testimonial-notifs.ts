"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  canShowMoreTestimonialsToday,
  pickContainerTestimonialLine,
  recordTestimonialShown,
  resolveViewerUsdAnchor,
} from "@/lib/container-testimonials"

const STRIP_MS = 11_000

function anonVisitorKey(pageKey: "login" | "register"): string {
  try {
    const k = "nexus_auth_visitor_v2"
    let id = sessionStorage.getItem(k)
    if (!id) {
      id = `v-${Math.random().toString(36).slice(2, 12)}`
      sessionStorage.setItem(k, id)
    }
    return `${id}:${pageKey}`
  } catch {
    return `anon:${pageKey}`
  }
}

/**
 * Bottom testimonial toasts on login/register (no Supabase user id yet).
 * Uses starter-tier amounts for anonymous visitors.
 */
export function useAuthTestimonialNotifs(opts: {
  enabled: boolean
  pageKey: "login" | "register"
  formatUserMoney: (amountUsd: number) => string
}) {
  const [visible, setVisible] = useState(false)
  const [text, setText] = useState("")
  const formatRef = useRef(opts.formatUserMoney)
  formatRef.current = opts.formatUserMoney

  const dismiss = useCallback(() => setVisible(false), [])

  useEffect(() => {
    if (!opts.enabled) return
    const uid = anonVisitorKey(opts.pageKey)
    const visitorAnchor = resolveViewerUsdAnchor({})

    const fire = () => {
      if (!canShowMoreTestimonialsToday(uid)) return
      const picked = pickContainerTestimonialLine({
        formatUserMoney: formatRef.current,
        userId: uid,
        viewerUsdAnchor: visitorAnchor,
      })
      if (!picked) return
      recordTestimonialShown(picked.displayName, uid, picked.amountUsd)
      setText(picked.line)
      setVisible(true)
      window.setTimeout(() => setVisible(false), STRIP_MS)
    }

    const d1 = 7_500 + Math.random() * 8_500
    const d2 = 55_000 + Math.random() * 45_000
    const t1 = window.setTimeout(fire, d1)
    const t2 = window.setTimeout(fire, d2)
    return () => {
      window.clearTimeout(t1)
      window.clearTimeout(t2)
    }
  }, [opts.enabled, opts.pageKey])

  return { visible, text, dismiss }
}
