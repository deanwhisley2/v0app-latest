"use client"

import { RefreshCw } from "lucide-react"
import { useOperationalBootstrap } from "@/contexts/OperationalBootstrapContext"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/** Top-right workspace refresh — spinner only while bootstrap refetches. */
export function DashboardWorkspaceRefresh({ className }: { className?: string }) {
  const { isLoading, refetch } = useOperationalBootstrap()

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={isLoading ? "Refreshing data" : "Refresh workspace data"}
      disabled={isLoading}
      className={cn("nexus-touch-press min-h-10 min-w-10 touch-manipulation", className)}
      onClick={() => void refetch()}
    >
      <RefreshCw
        className={cn("h-5 w-5 text-muted-foreground", isLoading && "animate-spin text-primary")}
        aria-hidden
      />
    </Button>
  )
}
