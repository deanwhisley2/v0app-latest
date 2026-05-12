"use client"

import { useCallback, useRef, useState } from "react"
import { cn } from "@/lib/utils"

type NotificationSwipeRowProps = {
  children: React.ReactNode
  className?: string
  onSwipeRight: () => void
  onSwipeLeft: () => void
  disabled?: boolean
}

/** Swipe right → primary action (delete). Swipe left → secondary (archive / read). */
export function NotificationSwipeRow({
  children,
  className,
  onSwipeRight,
  onSwipeLeft,
  disabled,
}: NotificationSwipeRowProps) {
  const startX = useRef(0)
  const dragging = useRef(false)
  const [dx, setDx] = useState(0)
  const [liveDrag, setLiveDrag] = useState(false)

  const reset = useCallback(() => {
    dragging.current = false
    setLiveDrag(false)
    setDx(0)
  }, [])

  const threshold = 64

  const end = useCallback(() => {
    if (disabled) {
      reset()
      return
    }
    if (dx > threshold) {
      onSwipeRight()
    } else if (dx < -threshold) {
      onSwipeLeft()
    }
    reset()
  }, [dx, disabled, onSwipeLeft, onSwipeRight, reset])

  return (
    <div
      className={cn("relative overflow-hidden rounded-xl touch-manipulation", className)}
      onTouchStart={(e) => {
        if (disabled || e.touches.length !== 1) return
        dragging.current = true
        setLiveDrag(true)
        startX.current = e.touches[0].clientX
      }}
      onTouchMove={(e) => {
        if (!dragging.current || disabled || e.touches.length !== 1) return
        const x = e.touches[0].clientX
        setDx(Math.max(-120, Math.min(120, x - startX.current)))
      }}
      onTouchEnd={end}
      onTouchCancel={reset}
    >
      <div
        className="absolute inset-y-0 left-0 flex w-16 items-center justify-center rounded-l-xl bg-rose-500/25 text-[10px] font-semibold text-rose-200"
        style={{ opacity: dx > 8 ? Math.min(1, dx / threshold) : 0 }}
        aria-hidden
      >
        Delete
      </div>
      <div
        className="absolute inset-y-0 right-0 flex w-16 items-center justify-center rounded-r-xl bg-emerald-500/25 text-[10px] font-semibold text-emerald-200"
        style={{ opacity: dx < -8 ? Math.min(1, -dx / threshold) : 0 }}
        aria-hidden
      >
        Archive
      </div>
      <div
        className="relative z-[1] bg-transparent"
        style={{
          transform: `translateX(${dx}px)`,
          transition: liveDrag ? "none" : "transform 0.22s cubic-bezier(0.34, 1.56, 0.64, 1)",
        }}
      >
        {children}
      </div>
    </div>
  )
}
