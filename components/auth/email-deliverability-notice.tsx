"use client"

import { useEffect, useState } from "react"
import { AlertCircle, ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const SPAM_ACK_KEY = "nexus_email_spam_folder_ack"

export const EMAIL_DELIVERABILITY_HINT =
  "Codes and verification emails may arrive in Spam, Junk, Promotions, or Updates — not only your Inbox."

type Props = {
  className?: string
  /** When true, starts collapsed on viewports under md. */
  collapsibleOnMobile?: boolean
}

export function EmailDeliverabilityNotice({
  className,
  collapsibleOnMobile = true,
}: Props) {
  const [open, setOpen] = useState(true)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    try {
      if (sessionStorage.getItem(SPAM_ACK_KEY) === "1") setDismissed(true)
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    if (!collapsibleOnMobile) return
    const mq = window.matchMedia("(min-width: 768px)")
    const sync = () => setOpen(mq.matches)
    sync()
    mq.addEventListener("change", sync)
    return () => mq.removeEventListener("change", sync)
  }, [collapsibleOnMobile])

  function handleCheckedSpam() {
    try {
      sessionStorage.setItem(SPAM_ACK_KEY, "1")
    } catch {
      /* ignore */
    }
    setDismissed(true)
    if (collapsibleOnMobile) setOpen(false)
  }

  if (dismissed) {
    return (
      <p className={cn("text-center text-xs text-muted-foreground", className)}>
        <button
          type="button"
          className="text-primary underline-offset-4 hover:underline"
          onClick={() => setDismissed(false)}
        >
          Show email folder tips
        </button>
      </p>
    )
  }

  const showBody = open || !collapsibleOnMobile

  return (
    <div
      className={cn(
        "rounded-lg border border-amber-500/35 bg-amber-500/10 text-amber-950 dark:text-amber-100",
        className,
      )}
      role="note"
    >
      <div className="flex items-start gap-2 p-3">
        <AlertCircle
          className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400"
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          {collapsibleOnMobile ? (
            <button
              type="button"
              className="flex w-full min-h-[36px] items-center justify-between gap-2 text-left touch-manipulation md:pointer-events-none md:min-h-0"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={showBody}
            >
              <span className="text-xs font-semibold text-amber-900 dark:text-amber-50">
                Check Spam / Junk folders
              </span>
              <ChevronDown
                className={cn(
                  "h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300 md:hidden",
                  showBody && "rotate-180",
                )}
                aria-hidden
              />
            </button>
          ) : (
            <p className="text-xs font-semibold text-amber-900 dark:text-amber-50">
              Check Spam / Junk folders
            </p>
          )}
          {showBody ? (
            <p className="mt-1.5 text-xs leading-relaxed text-amber-900/90 dark:text-amber-100/90">
              {EMAIL_DELIVERABILITY_HINT}
            </p>
          ) : null}
        </div>
      </div>
      {showBody ? (
        <div className="border-t border-amber-500/25 px-3 pb-3 pt-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 w-full border-amber-600/40 bg-background/60 text-xs font-medium text-amber-950 hover:bg-amber-500/15 dark:text-amber-50"
            onClick={handleCheckedSpam}
          >
            I&apos;ve checked Spam/Junk
          </Button>
        </div>
      ) : null}
    </div>
  )
}
