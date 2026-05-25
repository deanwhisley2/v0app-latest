"use client"

import { useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import dynamic from "next/dynamic"
import { ArrowLeft } from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"

const SecurityRecoveryScreen = dynamic(
  () =>
    import("@/components/dashboard/security-recovery-screen").then((m) => m.SecurityRecoveryScreen),
  {
    ssr: false,
    loading: () => (
      <p className="text-sm text-muted-foreground" aria-busy="true">
        Loading security settings…
      </p>
    ),
  },
)

export default function DashboardSecurityPage() {
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
          href="/dashboard"
          className="mb-5 inline-flex min-h-[44px] items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
          Back to dashboard
        </Link>
        <SecurityRecoveryScreen />
      </div>
    </div>
  )
}
