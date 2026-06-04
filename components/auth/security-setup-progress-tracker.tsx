"use client"

import { Check } from "lucide-react"
import type { SecuritySetupProgressItem } from "@/lib/nexus-security-profile-types"
import { cn } from "@/lib/utils"

type Props = {
  items: SecuritySetupProgressItem[]
  completedCount: number
  totalCount: number
  className?: string
}

export function SecuritySetupProgressTracker({
  items,
  completedCount,
  totalCount,
  className,
}: Props) {
  return (
    <div className={cn("rounded-xl border border-border/80 bg-muted/15 p-4", className)}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">Security setup</h3>
        <p className="text-xs font-medium text-muted-foreground">
          {completedCount} of {totalCount} completed
        </p>
      </div>
      <ul className="mt-3 space-y-2">
        {items.map((item) => (
          <li key={item.key} className="flex items-center gap-2 text-sm">
            <span
              className={cn(
                "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold",
                item.complete
                  ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                  : "border-muted-foreground/40 text-muted-foreground",
              )}
              aria-hidden
            >
              {item.complete ? <Check className="h-3 w-3" /> : "○"}
            </span>
            <span className={item.complete ? "text-foreground" : "text-muted-foreground"}>
              {item.label}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
