"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, Loader2 } from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"
import { DepositWithdrawDetailsPanel } from "@/components/dashboard/deposit-withdraw-details-panel"

export default function DepositWithdrawSettingsPage() {
  const router = useRouter()
  const { user, isLoading: authLoading } = useAuth()

  useEffect(() => {
    if (authLoading) return
    if (!user) {
      router.replace("/auth/login")
    }
  }, [authLoading, user, router])

  if (authLoading || !user) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="min-h-[100dvh] bg-background pb-8">
      <div className="mx-auto w-full max-w-lg px-4 py-6">
        <Link
          href="/dashboard?tab=settings"
          prefetch={false}
          className="mb-5 inline-flex min-h-[44px] items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
          Back to dashboard
        </Link>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Deposit & withdrawal details</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Register your payout details here before using Add Funds or Withdraw on the dashboard.
        </p>
        <DepositWithdrawDetailsPanel />
      </div>
    </div>
  )
}
