"use client"

import { useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import dynamic from "next/dynamic"
import { ArrowLeft, MessageCircle } from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"

const SecurityAppealCenter = dynamic(
  () => import("@/components/dashboard/security-appeal-center").then((m) => m.SecurityAppealCenter),
  {
    ssr: false,
    loading: () => (
      <p className="text-sm text-muted-foreground" aria-busy="true">
        Loading appeal center…
      </p>
    ),
  },
)

export default function DashboardSecurityAppealPage() {
  const router = useRouter()
  const { user, isLoading: authLoading, isGuestSession } = useAuth()

  useEffect(() => {
    if (isGuestSession) return
    if (!authLoading && !user) {
      router.replace("/auth/login")
    }
  }, [authLoading, user, isGuestSession, router])

  if (authLoading || !user) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="min-h-[100dvh] bg-background pb-8">
      <div className="mx-auto w-full max-w-lg px-4 py-6 md:max-w-2xl">
        <Link
          href="/dashboard/security"
          className="mb-5 inline-flex min-h-[44px] items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
          Back to Security & Recovery
        </Link>
        <header className="mb-4 flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/12 ring-1 ring-primary/20">
            <MessageCircle className="h-5 w-5 text-primary" aria-hidden />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">Security Appeal Center</h1>
            <p className="text-sm text-muted-foreground">Request payout or security detail updates.</p>
          </div>
        </header>
        <SecurityAppealCenter />
      </div>
    </div>
  )
}
