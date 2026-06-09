"use client"

import type { HTMLAttributes, ReactNode } from "react"
import { NEXUS_SECURE_SHIELD_CLASS } from "@/lib/security/secure-input"
import { cn } from "@/lib/utils"

type NexusSecureShieldProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode
}

/**
 * Isolated render layer for PINs, TX refs, and merchant credentials.
 * Pairs with nexus-secure-shield.css capture/print blanking rules.
 */
export function NexusSecureShield({ children, className, style, ...rest }: NexusSecureShieldProps) {
  return (
    <div
      {...rest}
      className={cn(NEXUS_SECURE_SHIELD_CLASS, className)}
      data-private="true"
      style={{ isolation: "isolate", contain: "layout style paint", ...style }}
      {...({ disableRemotePlayback: true } as HTMLAttributes<HTMLDivElement>)}
    >
      {children}
    </div>
  )
}
