"use client"

import { useEffect, useState, type ReactNode } from "react"
import { ChevronDown } from "lucide-react"
import { useIsMobile } from "@/hooks/use-mobile"
import { isLowGpuAndroid } from "@/lib/mobile/mobile-low-gpu-mode"
import { cn } from "@/lib/utils"

type Props = {
  sidebar?: ReactNode
  children: ReactNode
  expandLabel?: string
  collapseLabel?: string
  /** Active trade sessions — auto-expands desk on mobile when > 0. */
  activeTradeCount?: number
  /** Bump from dashboard (e.g. trade notification) to force mobile desk open. */
  deskOpenNonce?: number
}

/**
 * Trading desk below wallet home. ContainerMode stays mounted when collapsed on mobile
 * so session hydration and polling continue; only visibility toggles.
 */
export function ContainerDeskSection({
  sidebar,
  children,
  expandLabel = "Open trading workspace",
  collapseLabel = "Hide trading workspace",
  activeTradeCount = 0,
  deskOpenNonce = 0,
}: Props) {
  const isMobile = useIsMobile()
  const lowGpu = isLowGpuAndroid()
  const [mobileOpen, setMobileOpen] = useState(() => !lowGpu)

  useEffect(() => {
    if (activeTradeCount > 0) setMobileOpen(true)
  }, [activeTradeCount])

  useEffect(() => {
    if (deskOpenNonce > 0) setMobileOpen(true)
  }, [deskOpenNonce])

  const deskVisible = !isMobile || mobileOpen

  return (
    <div className="nexus-container-desk">
      {isMobile ? (
        <button
          type="button"
          onClick={() => setMobileOpen((v) => !v)}
          className="mb-3 flex min-h-12 w-full items-center justify-between gap-2 rounded-xl border border-border bg-card px-4 py-3 text-left text-sm font-semibold text-foreground"
          aria-expanded={mobileOpen}
        >
          <span className="flex min-w-0 flex-1 items-center gap-2">
            <span className="truncate">{mobileOpen ? collapseLabel : expandLabel}</span>
            {!mobileOpen && activeTradeCount > 0 ? (
              <span className="shrink-0 rounded-full bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary">
                {activeTradeCount} active
              </span>
            ) : null}
          </span>
          <ChevronDown
            className={cn(
              "h-5 w-5 shrink-0 text-muted-foreground transition-transform max-md:transition-none",
              mobileOpen && "rotate-180",
            )}
            aria-hidden
          />
        </button>
      ) : null}

      <div
        className={cn(
          "nexus-flat-card flex flex-col gap-4 rounded-[1.25rem] border border-border/30 bg-card p-2 shadow-[var(--shadow-card)] lg:flex-row lg:p-3",
          isMobile && !deskVisible && "hidden",
        )}
        aria-hidden={isMobile && !deskVisible}
      >
        {sidebar ? <div className="hidden lg:block lg:w-[240px] lg:flex-shrink-0">{sidebar}</div> : null}
        <main className="min-w-0 flex-1">
          {children}
        </main>
      </div>
    </div>
  )
}
