"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { pickContainerTestimonialLine, recordTestimonialShown } from "@/lib/container-testimonials"

const STRIP_MS = 12_000

function anonVisitorKey(pageKey: "login" | "register"): string {
  try {
    const k = "nexus_auth_visitor_v1"
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
 * Two staggered strips per page visit so new visitors see social proof on auth surfaces.
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

    const fire = () => {
      const picked = pickContainerTestimonialLine({
        formatUserMoney: formatRef.current,
        userId: uid,
      })
      if (!picked) return
      recordTestimonialShown(picked.displayName, uid)
      setText(picked.line)
      setVisible(true)
      window.setTimeout(() => setVisible(false), STRIP_MS)
    }

    const d1 = 8500 + Math.random() * 9000
    const d2 = 72_000 + Math.random() * 48_000
    const t1 = window.setTimeout(fire, d1)
    const t2 = window.setTimeout(fire, d2)
    return () => {
      window.clearTimeout(t1)
      window.clearTimeout(t2)
    }
  }, [opts.enabled, opts.pageKey])

  return { visible, text, dismiss }
}
