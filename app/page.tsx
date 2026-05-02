"use client"

import { useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useAuth } from "@/contexts/AuthContext"
import { Button } from "@/components/ui/button"

export default function HomePage() {
  const router = useRouter()
  const { user, isLoading } = useAuth()

  useEffect(() => {
    if (!isLoading && user) {
      router.replace("/dashboard")
      router.refresh()
    }
  }, [isLoading, user, router])

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  if (user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b border-border bg-background/95 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <div className="flex flex-col leading-none">
            <span className="font-mono text-xl font-black tracking-tight text-primary">NEXUS</span>
            <span className="text-[10px] font-bold tracking-[0.35em] text-cyan-400">PRO</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" asChild>
              <Link href="/auth/login">Log in</Link>
            </Button>
            <Button asChild>
              <Link href="/auth/register">Register</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-center justify-center px-4 py-16 text-center">
        <h1 className="max-w-2xl text-4xl font-bold tracking-tight text-foreground md:text-5xl">
          Trade smarter with real-time crypto intelligence
        </h1>
        <p className="mt-4 max-w-xl text-lg text-muted-foreground">
          Sign in to access your dashboard, charts, and automated strategies. New here? Create an account in seconds.
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
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
