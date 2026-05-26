"use client"

import { useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, Loader2 } from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"
import { useOperationalBootstrap } from "@/contexts/OperationalBootstrapContext"
import { AdminResellersPanel } from "@/components/admin/admin-resellers-panel"

export default function AdminResellersPage() {
  const router = useRouter()
  const { user, isLoading: authLoading } = useAuth()
  const op = useOperationalBootstrap()
  const level = op.snapshot?.profile?.tradingUserLevel ?? 0
  const isL5 = level === 5

  useEffect(() => {
    if (authLoading) return
    if (!user) {
      router.replace("/auth/login")
      return
    }
    if (!op.isLoading && op.snapshot && !isL5) {
      router.replace("/dashboard")
    }
  }, [authLoading, user, op.isLoading, op.snapshot, isL5, router])

  if (authLoading || !user || (op.isLoading && !op.snapshot)) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!isL5) return null

  return (
    <div className="min-h-[100dvh] bg-background">
      <div className="border-b border-border px-4 py-3">
        <Link
          href="/dashboard"
          prefetch={false}
          className="inline-flex min-h-[44px] items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Back to dashboard
        </Link>
      </div>
      <AdminResellersPanel />
    </div>
  )
}
