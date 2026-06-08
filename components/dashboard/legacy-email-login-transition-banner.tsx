"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { fetchSecurityProfilePassive } from "@/lib/nexus-security-profile-client"
import { supabase } from "@/lib/supabaseClient"

const DISMISS_KEY = "nexus_legacy_email_login_reminder_dismissed_v1"

type Props = {
  onOpenSettings?: () => void
}

export function LegacyEmailLoginTransitionBanner({ onOpenSettings }: Props) {
  const [visible, setVisible] = useState(false)
  const [message, setMessage] = useState("")

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
      if (profile?.legacyEmailLoginReminder) {
        setMessage(profile.legacyEmailLoginReminder)
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
      className="mx-auto mb-2 flex max-w-[1600px] items-start gap-3 rounded-xl border border-sky-500/30 bg-sky-500/8 px-4 py-3 text-sm"
      role="status"
    >
      <p className="flex-1 leading-relaxed text-muted-foreground">{message}</p>
      <div className="flex shrink-0 items-center gap-1">
        {onOpenSettings ? (
          <Button type="button" variant="outline" size="sm" className="touch-manipulation" onClick={onOpenSettings}>
            Open Settings
          </Button>
        ) : (
          <Button asChild type="button" variant="outline" size="sm" className="touch-manipulation">
            <Link href="/settings/deposit-withdraw">Open Settings</Link>
          </Button>
        )}
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
