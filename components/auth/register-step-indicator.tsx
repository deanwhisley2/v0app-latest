"use client"

import { Check } from "lucide-react"
import { cn } from "@/lib/utils"

type Step = { id: number; label: string }

type Props = {
  steps: Step[]
  current: number
  className?: string
}

export function RegisterStepIndicator({ steps, current, className }: Props) {
  return (
    <ol className={cn("mb-6 flex items-center justify-between gap-1", className)} aria-label="Registration progress">
      {steps.map((step, i) => {
        const done = current > step.id
        const active = current === step.id
        return (
          <li key={step.id} className="flex flex-1 flex-col items-center gap-1.5">
            <div className="flex w-full items-center">
              {i > 0 ? (
                <div
                  className={cn("h-0.5 flex-1", done || active ? "bg-primary" : "bg-border")}
                  aria-hidden
                />
              ) : (
                <div className="flex-1" aria-hidden />
              )}
              <div
                className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors",
                  done && "bg-primary text-primary-foreground",
                  active && !done && "bg-primary/20 text-primary ring-2 ring-primary",
                  !done && !active && "bg-muted text-muted-foreground"
                )}
                aria-current={active ? "step" : undefined}
              >
                {done ? <Check className="h-4 w-4" aria-hidden /> : step.id}
              </div>
              {i < steps.length - 1 ? (
                <div
                  className={cn("h-0.5 flex-1", done ? "bg-primary" : "bg-border")}
                  aria-hidden
                />
              ) : (
                <div className="flex-1" aria-hidden />
              )}
            </div>
            <span
              className={cn(
                "max-w-[4.5rem] text-center text-[10px] font-medium leading-tight sm:max-w-none sm:text-xs",
                active ? "text-foreground" : "text-muted-foreground"
              )}
            >
              {step.label}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
