"use client"

import { useState, type ReactNode } from "react"
import { ChevronDown } from "lucide-react"
import { useIsMobile } from "@/hooks/use-mobile"
type Props = {
  sidebar?: ReactNode
  children: ReactNode
  expandLabel?: string
  collapseLabel?: string
}

/**
 * Trading desk below wallet home — on mobile, collapsed by default so wallet panels
 * scroll without compositing against animated container UI underneath.
 */
export function ContainerDeskSection({
  sidebar,
  children,
  expandLabel = "Open trading workspace",
  collapseLabel = "Hide trading workspace",
}: Props) {
  const isMobile = useIsMobile()
  const [mobileOpen, setMobileOpen] = useState(false)
  const showDesk = !isMobile || mobileOpen

  return (
    <div className="nexus-container-desk">
      {isMobile ? (
        <button
          type="button"
          onClick={() => setMobileOpen((v) => !v)}
          className="mb-3 flex min-h-12 w-full items-center justify-between gap-2 rounded-xl border border-border bg-card px-4 py-3 text-left text-sm font-semibold text-foreground"
          aria-expanded={mobileOpen}
        >
          <span>{mobileOpen ? collapseLabel : expandLabel}</span>
          <ChevronDown className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
        </button>
      ) : null}

      {showDesk ? (
        <div className="nexus-flat-card flex flex-col gap-4 rounded-2xl border border-border bg-card p-2 lg:flex-row lg:p-3">
          {sidebar ? <div className="hidden lg:block lg:w-[240px] lg:flex-shrink-0">{sidebar}</div> : null}
          <main className="min-w-0 flex-1">{children}</main>
        </div>
      ) : null}
    </div>
  )
}
