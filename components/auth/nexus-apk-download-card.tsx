"use client"

import { useEffect, useState } from "react"
import { brandAsset } from "@/lib/site-branding"
import { isAndroidChromeBrowser } from "@/lib/mobile/chrome-android-safe-mode"

const APK_HREF = brandAsset("/app-debug.apk")

const NEXUS_APK_UA_TOKEN = "NexusProApp"

function isInsideApkShell(): boolean {
  if (typeof window === "undefined") return false
  try {
    const cap = (window as Window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor
    if (cap?.isNativePlatform?.()) return true
  } catch {
    /* ignore */
  }
  const ua = navigator.userAgent
  if (ua && new RegExp(NEXUS_APK_UA_TOKEN, "i").test(ua)) return true
  return false
}

function AndroidRobotIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} xmlns="http://www.w3.org/2000/svg">
      <path d="M17.6 9.48c.34 0 .61-.28.61-.62 0-.34-.27-.62-.61-.62-.34 0-.62.28-.62.62 0 .34.28.62.62.62zm-11.2 0c.34 0 .62-.28.62-.62 0-.34-.28-.62-.62-.62-.34 0-.61.28-.61.62 0 .34.27.62.61.62zM12 3.5c-3.59 0-6.5 2.68-6.5 6v.5h13v-.5c0-3.32-2.91-6-6.5-6zm5.5 8H6.5v6.25c0 .69.56 1.25 1.25 1.25h.75v2c0 .69.56 1.25 1.25 1.25s1.25-.56 1.25-1.25v-2h3.5v2c0 .69.56 1.25 1.25 1.25s1.25-.56 1.25-1.25v-2h.75c.69 0 1.25-.56 1.25-1.25V11.5z" />
    </svg>
  )
}

/**
 * Conversion card for Android browser users — hidden inside APK / PWA standalone shell.
 */
export function NexusApkDownloadCard() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    setVisible(isAndroidChromeBrowser() && !isInsideApkShell())
  }, [])

  if (!visible) return null

  return (
    <section className="mt-6 rounded-xl border border-slate-800 bg-[#161b22]/50 p-4" aria-label="Download Nexus Pro Android app">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-emerald-500/20 bg-emerald-500/5 shadow-[0_0_12px_rgba(0,184,124,0.25)]">
            <AndroidRobotIcon className="h-6 w-6 fill-[#00b87c]" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white">Get the Nexus Pro App</p>
            <p className="mt-0.5 text-xs text-slate-400">Lightweight APK • Real-time Earnings Push Alerts</p>
          </div>
        </div>
        <a
          href={APK_HREF}
          download="Nexus_Pro.apk"
          className="shrink-0 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-1.5 text-xs font-medium text-[#00b87c] transition hover:bg-emerald-500/10"
        >
          Download App
        </a>
      </div>
    </section>
  )
}
