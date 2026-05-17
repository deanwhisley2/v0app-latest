"use client"

import { useCallback, useRef, useState } from "react"
import { cn } from "@/lib/utils"

type NotificationSwipeRowProps = {
  children: React.ReactNode
  className?: string
  onSwipeRight: () => void
  onSwipeLeft: () => void
  disabled?: boolean
  /** Swipe hint labels (institutional, not loud). */
  deleteLabel?: string
  archiveLabel?: string
}

/** Swipe right → dismiss. Swipe left → save for later. Deliberate threshold for low-end touch. */
export function NotificationSwipeRow({
  children,
  className,
  onSwipeRight,
  onSwipeLeft,
  disabled,
  deleteLabel = "Remove",
  archiveLabel = "Save",
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

  const threshold = 76

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
      className={cn("relative overflow-hidden rounded-xl touch-manipulation [touch-action:pan-y]", className)}
      onTouchStart={(e) => {
        if (disabled || e.touches.length !== 1) return
        dragging.current = true
        setLiveDrag(true)
        startX.current = e.touches[0].clientX
      }}
      onTouchMove={(e) => {
        if (!dragging.current || disabled || e.touches.length !== 1) return
        const x = e.touches[0].clientX
        setDx(Math.max(-100, Math.min(100, x - startX.current)))
      }}
      onTouchEnd={end}
      onTouchCancel={reset}
    >
      <div
        className="absolute inset-y-0 left-0 flex w-[4.5rem] items-center justify-center bg-muted/50 text-[10px] font-medium text-muted-foreground"
        style={{ opacity: dx > 10 ? Math.min(1, dx / threshold) : 0 }}
        aria-hidden
      >
        {deleteLabel}
      </div>
      <div
        className="absolute inset-y-0 right-0 flex w-[4.5rem] items-center justify-center bg-muted/50 text-[10px] font-medium text-muted-foreground"
        style={{ opacity: dx < -10 ? Math.min(1, -dx / threshold) : 0 }}
        aria-hidden
      >
        {archiveLabel}
      </div>
      <div
        className="relative z-[1] bg-transparent"
        style={{
          transform: `translateX(${dx}px)`,
          transition: liveDrag ? "none" : "transform 0.2s ease-out",
        }}
      >
        {children}
      </div>
    </div>
  )
}
