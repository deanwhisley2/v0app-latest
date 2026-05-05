"use client"

import { useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useAuth } from "@/contexts/AuthContext"
import { isDevLocalOnly } from "@/lib/dev-local-mode"
import { isGuestLoginEnabled } from "@/lib/free-entry"
import { Button } from "@/components/ui/button"
import { NexusProLogo } from "@/components/brand/nexus-pro-logo"

export default function HomePage() {
  const router = useRouter()
  const { user, isLoading, isGuestSession, reenterGuestMode } = useAuth()

  useEffect(() => {
    if (isLoading) return
    if (isDevLocalOnly()) {
      router.replace("/dashboard")
      router.refresh()
      return
    }
    if (user && !isGuestSession) {
      router.replace("/dashboard")
      router.refresh()
    }
  }, [isLoading, user, isGuestSession, router])

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div
          className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent"
          style={{
            borderColor: "rgba(100,200,255,0.25)",
            borderTopColor: "rgba(100,200,255,0.95)",
          }}
          aria-label="Loading"
        />
      </div>
    )
  }

  if (isDevLocalOnly()) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div
          className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent"
          style={{
            borderColor: "rgba(100,200,255,0.25)",
            borderTopColor: "rgba(100,200,255,0.95)",
          }}
          aria-label="Opening dashboard"
        />
      </div>
    )
  }

  if (user && !isGuestSession) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="relative flex min-h-screen flex-col overflow-x-hidden bg-background">
      <header className="relative z-10 border-b border-border bg-background/80 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <Link href="/" className="flex items-center outline-offset-4 hover:opacity-95">
            <NexusProLogo variant="default" className="h-8 w-auto sm:h-9" aria-label="NEXUS PRO home" />
          </Link>
          <div className="flex items-center gap-2">
            {isGuestSession && (
              <Button variant="secondary" asChild>
                <Link href="/dashboard">Open dashboard</Link>
              </Button>
            )}
            <Button variant="ghost" asChild>
              <Link href="/auth/login">Log in</Link>
            </Button>
            <Button asChild>
              <Link href="/auth/register">Register</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto flex w-full max-w-5xl flex-1 flex-col items-center justify-center px-4 py-16 text-center">
        <h1 className="max-w-2xl text-4xl font-bold tracking-tight text-foreground md:text-5xl">
          Trade smarter with real-time crypto intelligence
        </h1>
        <p className="mt-4 max-w-xl text-lg text-muted-foreground">
          Sign in to access your dashboard, charts, and automated strategies. New here? Create an account in seconds.
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          {isGuestLoginEnabled() && !isLoading && !user && (
            <Button
              size="lg"
              variant="secondary"
              onClick={() => {
                try {
                  sessionStorage.setItem("nexus_guest_enter", "1")
                } catch {
                  reenterGuestMode()
                }
                router.push("/dashboard")
              }}
            >
              Browse without an account
            </Button>
          )}
          <Button size="lg" asChild>
            <Link href="/auth/register">Get started</Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <Link href="/auth/login">I have an account</Link>
          </Button>
        </div>
      </main>
    </div>
  )
}
