"use client"

import { useEffect, useRef, useState } from "react"
import { Shield } from "lucide-react"
import { supabase } from "@/lib/supabaseClient"
import {
  fetchSecurityNeedsSetupPassive,
  readCachedNeedsSetup,
  securityProfileDebug,
  securityProfileDebugRender,
} from "@/lib/nexus-security-profile-client"

type Props = {
  enabled?: boolean
  onOpenSecuritySettings?: () => void
}

/**
 * Non-blocking security reminder — never replaces dashboard children.
 * Shows a compact banner only when setup is incomplete (after background check).
 */
export function NexusSecurityPassiveNotice({ enabled = true, onOpenSecuritySettings }: Props) {
  const [needsSetup, setNeedsSetup] = useState<boolean | null>(() => readCachedNeedsSetup())
  const checkedRef = useRef(false)

  securityProfileDebugRender("passive_notice")

  useEffect(() => {
    if (!enabled) return
    if (checkedRef.current) return
    checkedRef.current = true

    const cached = readCachedNeedsSetup()
    if (cached !== null) setNeedsSetup(cached)

    let cancelled = false
    void (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token || cancelled) return
      const result = await fetchSecurityNeedsSetupPassive(token)
      if (cancelled) return
      setNeedsSetup(result.needsSetup)
      if (result.error) securityProfileDebug("passive_notice_error", { error: result.error })
    })()

    return () => {
      cancelled = true
    }
  }, [enabled])

  if (!enabled || needsSetup !== true) return null

  return (
    <div
      className="mx-3 mb-2 flex items-start gap-2 rounded-lg border border-amber-500/35 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-950 dark:text-amber-100 md:mx-4"
      role="status"
    >
      <Shield className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-medium">Security setup incomplete</p>
        <p className="mt-0.5 text-[11px] opacity-90">
          Add your Nexus Security Code in Settings before withdrawals. The app stays usable while you
          finish this.
        </p>
        {onOpenSecuritySettings ? (
          <button
            type="button"
            className="mt-1.5 font-semibold text-primary underline-offset-2 hover:underline touch-manipulation"
            onClick={onOpenSecuritySettings}
          >
            Open Security & Recovery
          </button>
        ) : null}
      </div>
    </div>
  )
}
