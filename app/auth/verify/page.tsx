"use client"

import { Suspense, useMemo } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { EmailVerification } from "@/components/EmailVerification"

function VerifyInner() {
  const searchParams = useSearchParams()
  const emailFromQuery = useMemo(() => {
    const raw = searchParams.get("email")
    return raw ? decodeURIComponent(raw) : ""
  }, [searchParams])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-8 rounded-2xl border border-border bg-card p-8 shadow-xl">
        <div className="text-center">
          <p className="font-mono text-2xl font-black tracking-tight text-primary">NEXUS</p>
          <p className="text-xs font-bold tracking-[0.3em] text-cyan-400">PRO</p>
          <h1 className="mt-4 text-2xl font-semibold text-foreground">Verify your email</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Enter the 6-digit code we sent you. Codes expire in 15 minutes.
          </p>
        </div>

        <EmailVerification initialEmail={emailFromQuery} />

        <p className="text-center text-xs text-muted-foreground">
          Wrong inbox?{" "}
          <Link href="/auth/register" className="text-primary underline-offset-4 hover:underline">
            Register again
          </Link>
        </p>
      </div>
    </div>
  )
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      }
    >
      <VerifyInner />
    </Suspense>
  )
}
