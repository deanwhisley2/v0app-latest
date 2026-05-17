"use client"

import { cn } from "@/lib/utils"

type Props = {
  className?: string
  compact?: boolean
}

/** Canonical Nexus welcome identity — logo + wordmark (not a rebrand). */
export function NexusAuthBrand({ className, compact }: Props) {
  return (
    <div className={cn("flex flex-col items-center text-center", className)}>
      <div
        className={cn(
          "relative overflow-hidden rounded-2xl ring-1 ring-primary/25 shadow-lg shadow-primary/15",
          compact ? "h-16 w-16" : "h-20 w-20 sm:h-[5.5rem] sm:w-[5.5rem]"
        )}
      >
        <img
          src="/logo.jpg"
          alt="Nexus Pro"
          width={88}
          height={88}
          className="h-full w-full object-cover"
          decoding="async"
        />
      </div>
      <h1
        className={cn(
          "mt-4 bg-gradient-to-r from-cyan-400 via-primary to-cyan-300 bg-clip-text font-bold tracking-tight text-transparent",
          compact ? "text-lg" : "text-xl sm:text-2xl"
        )}
      >
        Nexus Pro
      </h1>
      <p className="mt-1 max-w-[16rem] text-xs leading-relaxed text-muted-foreground sm:text-sm">
        Institutional trading &amp; treasury workspace
      </p>
    </div>
  )
}
