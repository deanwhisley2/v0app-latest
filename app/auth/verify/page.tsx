'use client'

import { useEffect, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { EmailVerificationPendingScreen } from "@/components/auth/email-verification-pending-screen"
import {
  getPendingEmailVerification,
  setPendingEmailVerification,
} from "@/lib/auth/pending-email-verification"

function VerifyContent() {
  const searchParams = useSearchParams()
  const fromQuery = searchParams.get("email")?.trim() ?? ""
  const pending = getPendingEmailVerification()
  const email = fromQuery || pending?.email || ""
  const initialMode = pending?.enter_code_mode ? "enter-code" : "landing"

  useEffect(() => {
    if (!email) return
    setPendingEmailVerification({
      email,
      funding_country_code: pending?.funding_country_code,
      last_resend_at: pending?.last_resend_at,
      enter_code_mode: pending?.enter_code_mode,
      created_at: pending?.created_at,
    })
    if (fromQuery && typeof window !== "undefined") {
      window.history.replaceState({}, "", "/auth/verify")
    }
  }, [email, fromQuery, pending?.created_at, pending?.enter_code_mode, pending?.funding_country_code, pending?.last_resend_at])

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-8">
      <EmailVerificationPendingScreen initialEmail={email} initialMode={initialMode} />
    </div>
  )
}

export default function VerifyPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background">
          Loading...
        </div>
      }
    >
      <VerifyContent />
    </Suspense>
  )
}
