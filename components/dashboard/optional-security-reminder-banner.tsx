"use client"

import { useCallback, useEffect, useState } from "react"
import { X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { OPTIONAL_SECURITY_REMINDER } from "@/lib/nexus-security-minimum"
import { fetchSecurityProfilePassive } from "@/lib/nexus-security-profile-client"
import { supabase } from "@/lib/supabaseClient"

const DISMISS_KEY = "nexus_optional_security_reminder_dismissed_v1"

type Props = {
  onOpenSettings?: () => void
}

export function OptionalSecurityReminderBanner({ onOpenSettings }: Props) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    try {
      if (sessionStorage.getItem(DISMISS_KEY) === "1") return
    } catch {
      /* ignore */
    }
    void (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) return
      const { profile } = await fetchSecurityProfilePassive(token)
      if (profile?.fundingReminder || (profile?.hasMinimumSecurity && profile.suggestsOptionalEnhancements)) {
        setVisible(true)
      }
    })()
  }, [])

  const dismiss = useCallback(() => {
    try {
      sessionStorage.setItem(DISMISS_KEY, "1")
    } catch {
      /* ignore */
    }
    setVisible(false)
  }, [])

  if (!visible) return null

  return (
    <div
      className="mx-auto mb-2 flex max-w-[1600px] items-start gap-3 rounded-xl border border-primary/25 bg-primary/8 px-4 py-3 text-sm text-foreground"
      role="status"
    >
      <p className="flex-1 leading-relaxed text-muted-foreground">{OPTIONAL_SECURITY_REMINDER}</p>
      <div className="flex shrink-0 items-center gap-1">
        {onOpenSettings ? (
          <Button type="button" variant="outline" size="sm" className="touch-manipulation" onClick={onOpenSettings}>
            Add backup
          </Button>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 touch-manipulation"
          aria-label="Dismiss reminder"
          onClick={dismiss}
        >
          <X className="h-4 w-4" aria-hidden />
        </Button>
      </div>
    </div>
  )
}
