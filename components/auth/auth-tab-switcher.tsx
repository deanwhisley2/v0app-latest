"use client"

import { cn } from "@/lib/utils"

export type AuthTabOption<T extends string> = {
  id: T
  label: string
}

type Props<T extends string> = {
  tabs: AuthTabOption<T>[]
  active: T
  onChange: (id: T) => void
  disabled?: boolean
  className?: string
  size?: "default" | "compact"
}

export function AuthTabSwitcher<T extends string>({
  tabs,
  active,
  onChange,
  disabled = false,
  className,
  size = "default",
}: Props<T>) {
  return (
    <div
      className={cn(
        "flex rounded-2xl border border-white/[0.08] bg-white/[0.03] p-1",
        className,
      )}
      role="tablist"
    >
      {tabs.map((tab) => {
        const selected = active === tab.id
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={selected}
            disabled={disabled}
            className={cn(
              "flex-1 rounded-xl font-medium transition-all touch-manipulation",
              size === "compact" ? "min-h-10 px-2 text-xs" : "min-h-11 px-3 text-sm",
              selected
                ? "bg-primary/90 text-primary-foreground shadow-sm shadow-primary/20"
                : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => onChange(tab.id)}
          >
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}
