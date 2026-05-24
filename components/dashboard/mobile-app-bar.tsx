"use client"

import type { ReactNode } from "react"
import { ConnectivityStrip } from "@/components/mobile/connectivity-strip"
import { SmartMobileHeaderShell } from "@/components/dashboard/smart-mobile-header-shell"

type MobileAppBarProps = {
  header: ReactNode
}

/** Single adaptive mobile top bar: connectivity (in-flow) + smart header. */
export function MobileAppBar({ header }: MobileAppBarProps) {
  return (
    <div className="nexus-mobile-app-bar md:contents">
      <ConnectivityStrip />
      <SmartMobileHeaderShell>{header}</SmartMobileHeaderShell>
    </div>
  )
}
