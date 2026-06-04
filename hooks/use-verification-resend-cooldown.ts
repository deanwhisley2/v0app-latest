"use client"

import { useCallback, useEffect, useState } from "react"
import {
  getPendingEmailVerification,
  getResendCooldownRemainingMs,
  recordVerificationResendSent,
  VERIFICATION_RESEND_COOLDOWN_MS,
  patchPendingEmailVerification,
} from "@/lib/auth/pending-email-verification"

export function useVerificationResendCooldown() {
  const [secondsLeft, setSecondsLeft] = useState(0)

  const sync = useCallback(() => {
    const pending = getPendingEmailVerification()
    const ms = getResendCooldownRemainingMs(pending?.last_resend_at)
    setSecondsLeft(ms > 0 ? Math.ceil(ms / 1000) : 0)
  }, [])

  useEffect(() => {
    sync()
    const id = window.setInterval(sync, 500)
    return () => window.clearInterval(id)
  }, [sync])

  const markSent = useCallback(() => {
    recordVerificationResendSent()
    setSecondsLeft(Math.ceil(VERIFICATION_RESEND_COOLDOWN_MS / 1000))
  }, [])

  const applyServerRetryAfter = useCallback((retryAfterSeconds?: number) => {
    if (!retryAfterSeconds || retryAfterSeconds <= 0) return
    const at = Date.now() - (VERIFICATION_RESEND_COOLDOWN_MS - retryAfterSeconds * 1000)
    patchPendingEmailVerification({ last_resend_at: at })
    setSecondsLeft(retryAfterSeconds)
  }, [])

  return {
    secondsLeft,
    canResend: secondsLeft <= 0,
    markSent,
    applyServerRetryAfter,
    refresh: sync,
  }
}
