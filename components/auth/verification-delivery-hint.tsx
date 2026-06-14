"use client"

import { useEffect, useState } from "react"
import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"

const SPAM_GUIDANCE =
  "Gmail may place security messages in Promotions or Spam. Outlook may use Junk. Add security@nexuspro-it-com.com to contacts if needed."

type Props = {
  className?: string
  /** When set, expandable spam guidance appears 60s after this timestamp. */
  codeSentAt?: number | null
}

export function VerificationDeliveryHint({ className, codeSentAt }: Props) {
  const [showDelayedGuidance, setShowDelayedGuidance] = useState(false)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    if (!codeSentAt) {
      setShowDelayedGuidance(false)
      return
    }
    const elapsed = () => Date.now() - codeSentAt >= 90_000
    if (elapsed()) {
      setShowDelayedGuidance(true)
      return
    }
    const id = window.setInterval(() => {
      if (elapsed()) {
        setShowDelayedGuidance(true)
        window.clearInterval(id)
      }
    }, 1000)
    return () => window.clearInterval(id)
  }, [codeSentAt])

  return (
    <div className={cn("space-y-2", className)}>
      <p className="text-center text-xs leading-relaxed text-muted-foreground/85">
        Verification email sent. Most emails arrive within 1 minute. Some providers may take up to 5 minutes.
      </p>
      {showDelayedGuidance ? (
        <div className="rounded-xl border border-border/50 bg-muted/10">
          <button
            type="button"
            className="flex w-full min-h-[44px] items-center justify-between gap-2 px-3 py-2.5 text-left text-xs text-muted-foreground touch-manipulation"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
          >
            <span>Still waiting? Check other folders</span>
            <ChevronDown
              className={cn("h-3.5 w-3.5 shrink-0 transition-transform", expanded && "rotate-180")}
              aria-hidden
            />
          </button>
          {expanded ? (
            <p className="border-t border-border/40 px-3 pb-3 pt-2 text-xs leading-relaxed text-muted-foreground">
              {SPAM_GUIDANCE}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
