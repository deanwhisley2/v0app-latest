"use client"

import { useEffect, useRef, useCallback, useState } from "react"

/**
 * Hook that provides scroll isolation for a container element.
 * Prevents scroll chaining, detects hover/focus, and handles dead-end animations.
 */
export function useScrollIsolation(options?: {
  onDeadEnd?: () => void
  enableGlow?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [isHovered, setIsHovered] = useState(false)
  const [isAtEnd, setIsAtEnd] = useState(false)
  const deadEndTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Detect scroll end (top or bottom)
  const handleScroll = useCallback(() => {
    const el = ref.current
    if (!el) return

    const atTop = el.scrollTop <= 0
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 2

    if (atTop || atBottom) {
      if (!isAtEnd) {
        setIsAtEnd(true)
        // Trigger dead-end animation
        if (options?.onDeadEnd) options.onDeadEnd()
        // Auto-clear after animation
        if (deadEndTimer.current) clearTimeout(deadEndTimer.current)
        deadEndTimer.current = setTimeout(() => setIsAtEnd(false), 600)
      }
    }
  }, [isAtEnd, options])

  // Cleanup
  useEffect(() => {
    return () => {
      if (deadEndTimer.current) clearTimeout(deadEndTimer.current)
    }
  }, [])

  return {
    ref,
    isHovered,
    isAtEnd,
    setIsHovered,
    handleScroll,
    scrollProps: {
      ref,
      onMouseEnter: () => setIsHovered(true),
      onMouseLeave: () => setIsHovered(false),
      onFocus: () => setIsHovered(true),
      onBlur: () => setIsHovered(false),
      onScroll: handleScroll,
      className: [
        "nexus-scroll-isolated",
        isHovered && options?.enableGlow ? "nexus-scroll-active" : "",
        isAtEnd ? "nexus-scroll-deadend" : "",
      ]
        .filter(Boolean)
        .join(" "),
    },
  }
}

/**
 * Hook that provides a global notification queue for toast-style notifications.
 * Prevents spam by limiting visible toasts.
 */
export function useNotificationQueue(maxVisible = 3) {
  const [queue, setQueue] = useState<Array<{ id: string; message: string; type: "success" | "error" | "info" }>>([])

  const push = useCallback((message: string, type: "success" | "error" | "info" = "info") => {
    const id = Math.random().toString(36).substring(2, 9)
    setQueue(prev => [...prev, { id, message, type }].slice(-maxVisible))
    // Auto-remove after 5 seconds
    setTimeout(() => {
      setQueue(prev => prev.filter(n => n.id !== id))
    }, 5000)
    return id
  }, [maxVisible])

  const remove = useCallback((id: string) => {
    setQueue(prev => prev.filter(n => n.id !== id))
  }, [])

  return { queue, push, remove }
}
