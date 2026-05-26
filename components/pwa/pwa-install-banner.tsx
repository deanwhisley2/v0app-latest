"use client"

import { useEffect, useRef, useState } from "react"
import { Download, X } from "lucide-react"
import { usePathname } from "next/navigation"
import { Button } from "@/components/ui/button"
import { isAndroidChromeBrowser } from "@/lib/mobile/chrome-android-safe-mode"
import { isPwaSafeMode } from "@/lib/mobile/pwa-safe-mode"

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}

declare global {
  interface Window {
    __NEXUS_BIP_EVENT__?: BeforeInstallPromptEvent
  }
}

const DISMISS_KEY = "nexus_pwa_install_dismissed_v1"

/**
 * Phase-1 PWA: install prompt only (no service worker registration).
 * Shown after dashboard is stable — extra delay on Chrome Android.
 */
export function PwaInstallBanner() {
  const pathname = usePathname()
  const [ready, setReady] = useState(false)
  const [visible, setVisible] = useState(false)
  const [dismissed, setDismissed] = useState(true)
  const bipRef = useRef<BeforeInstallPromptEvent | null>(null)

  useEffect(() => {
    if (isPwaSafeMode()) return
    try {
      setDismissed(sessionStorage.getItem(DISMISS_KEY) === "1")
    } catch {
      setDismissed(false)
    }

    const onBip = (e: Event) => {
      e.preventDefault()
      bipRef.current = e as BeforeInstallPromptEvent
      window.__NEXUS_BIP_EVENT__ = bipRef.current
    }
    window.addEventListener("beforeinstallprompt", onBip)
    return () => window.removeEventListener("beforeinstallprompt", onBip)
  }, [])

  useEffect(() => {
    if (isPwaSafeMode() || dismissed) return
    if (!pathname?.startsWith("/dashboard")) {
      setReady(false)
      setVisible(false)
      return
    }
    let cancelled = false
    const delay = isAndroidChromeBrowser() ? 1200 : 600
    const t = window.setTimeout(() => {
      if (!cancelled) {
        setReady(true)
        if (bipRef.current || window.__NEXUS_BIP_EVENT__) {
          bipRef.current = bipRef.current ?? window.__NEXUS_BIP_EVENT__ ?? null
          setVisible(true)
        }
      }
    }, delay)
    return () => {
      cancelled = true
      window.clearTimeout(t)
    }
  }, [pathname, dismissed])

  if (!ready || !visible || isPwaSafeMode()) return null

  const install = async () => {
    const ev = bipRef.current ?? window.__NEXUS_BIP_EVENT__
    if (!ev) return
    await ev.prompt()
    await ev.userChoice
    setVisible(false)
  }

  const dismiss = () => {
    try {
      sessionStorage.setItem(DISMISS_KEY, "1")
    } catch {
      /* ignore */
    }
    setDismissed(true)
    setVisible(false)
  }

  return (
    <div
      role="region"
      aria-label="Install Nexus Pro"
      className="fixed bottom-[calc(5.25rem+env(safe-area-inset-bottom,0px))] left-3 right-3 z-[90] mx-auto max-w-md rounded-2xl border border-primary/30 bg-card p-4 shadow-xl md:bottom-6 md:left-auto md:right-6"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15">
          <Download className="h-5 w-5 text-primary" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">Install Nexus Pro</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Add to your home screen for faster access. Dynamic pages always load from the network.
          </p>
          <div className="mt-3 flex gap-2">
            <Button type="button" size="sm" className="touch-manipulation" onClick={() => void install()}>
              Install
            </Button>
            <Button type="button" size="sm" variant="outline" className="touch-manipulation" onClick={dismiss}>
              Not now
            </Button>
          </div>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="shrink-0 rounded-lg p-1 text-muted-foreground touch-manipulation hover:text-foreground"
          aria-label="Dismiss install prompt"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
