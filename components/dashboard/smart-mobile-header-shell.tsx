"use client"

import { useLayoutEffect, useRef, useState, type ReactNode } from "react"
import { useSmartMobileHeader } from "@/hooks/use-smart-mobile-header"
import { isNativeMobileScrollMode } from "@/lib/mobile/native-mobile-scroll"
import { cn } from "@/lib/utils"

type SmartMobileHeaderShellProps = {
  children: ReactNode
}

export function SmartMobileHeaderShell({ children }: SmartMobileHeaderShellProps) {
  const nativeScroll = isNativeMobileScrollMode()
  const { enabled, visible, atTop } = useSmartMobileHeader()
  const innerRef = useRef<HTMLDivElement>(null)
  const [chromeHeight, setChromeHeight] = useState(56)

  useLayoutEffect(() => {
    if (nativeScroll) return
    const el = innerRef.current
    if (!el) return
    const measure = () => setChromeHeight(el.offsetHeight)
    measure()
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null
    ro?.observe(el)
    window.addEventListener("resize", measure)
    return () => {
      ro?.disconnect()
      window.removeEventListener("resize", measure)
    }
  }, [nativeScroll])

  if (nativeScroll) {
    return <div className="nexus-smart-header-shell-native md:contents">{children}</div>
  }

  return (
    <>
      {enabled ? (
        <div
          className="nexus-smart-header-spacer md:hidden"
          aria-hidden
          style={{ height: chromeHeight }}
        />
      ) : null}
      <div
        ref={innerRef}
        className={cn(
          "nexus-smart-header-shell md:contents",
          enabled && !visible && "is-hidden",
          enabled && !atTop && visible && "is-elevated",
        )}
      >
        {children}
      </div>
    </>
  )
}
