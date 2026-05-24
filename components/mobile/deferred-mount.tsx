"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"

type DeferredMountProps = {
  children: ReactNode
  /** Shown until visible or idle timeout (ms). */
  placeholder?: ReactNode
  rootMargin?: string
  idleMs?: number
  className?: string
}

/**
 * Mount children only when near viewport (or after idle) — keeps low-end Android responsive.
 */
export function DeferredMount({
  children,
  placeholder = null,
  rootMargin = "120px 0px",
  idleMs = 120,
  className,
}: DeferredMountProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    let cancelled = false
    const show = () => {
      if (!cancelled) setReady(true)
    }

    const idleId =
      typeof window.requestIdleCallback === "function"
        ? window.requestIdleCallback(() => show(), { timeout: idleMs + 400 })
        : window.setTimeout(show, idleMs)

    const observer =
      typeof IntersectionObserver !== "undefined"
        ? new IntersectionObserver(
            (entries) => {
              if (entries.some((e) => e.isIntersecting)) {
                show()
                observer?.disconnect()
              }
            },
            { root: null, rootMargin, threshold: 0.01 },
          )
        : null

    observer?.observe(el)

    return () => {
      cancelled = true
      observer?.disconnect()
      if (typeof window.cancelIdleCallback === "function" && typeof idleId === "number") {
        window.cancelIdleCallback(idleId)
      } else {
        window.clearTimeout(idleId as number)
      }
    }
  }, [idleMs, rootMargin])

  return (
    <div ref={ref} className={className}>
      {ready ? children : placeholder}
    </div>
  )
}
