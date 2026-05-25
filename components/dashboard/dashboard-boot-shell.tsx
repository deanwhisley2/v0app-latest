"use client"

import { Loader2 } from "lucide-react"

/** Static shell — identical server/client, no hooks that read storage. */
export function DashboardBootShell() {
  return (
    <div
      className="flex min-h-[100dvh] flex-col bg-background"
      aria-busy="true"
      aria-label="Loading dashboard"
    >
      <div className="h-14 border-b border-border/60 bg-card/80" />
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6">
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden />
        <p className="text-sm text-muted-foreground">Loading workspace…</p>
      </div>
    </div>
  )
}
