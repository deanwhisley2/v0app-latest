"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { EMAIL_VERIFICATION_REMINDER } from "@/lib/nexus-security-minimum"
import { fetchSecurityProfilePassive } from "@/lib/nexus-security-profile-client"
import { supabase } from "@/lib/supabaseClient"

const DISMISS_KEY = "nexus_email_verify_reminder_dismissed_v1"

export function EmailVerificationReminderBanner() {
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
      if (profile?.emailVerificationReminder) {
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
      className="mx-auto mb-2 flex max-w-[1600px] items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/8 px-4 py-3 text-sm"
      role="status"
    >
      <p className="flex-1 leading-relaxed text-muted-foreground">{EMAIL_VERIFICATION_REMINDER}</p>
      <div className="flex shrink-0 items-center gap-1">
        <Button asChild type="button" variant="outline" size="sm" className="touch-manipulation">
          <Link href="/dashboard/security">Verify in Settings</Link>
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 touch-manipulation"
          aria-label="Dismiss email reminder"
          onClick={dismiss}
        >
          <X className="h-4 w-4" aria-hidden />
        </Button>
      </div>
    </div>
  )
}
