/**
 * Global PWA install prompt capture — single deferredPrompt store for the whole app.
 * Prevents per-component listeners missing or duplicating beforeinstallprompt.
 */

import { isStandalonePwa } from "@/lib/android-install/device-detection"
import { logInstallEvent } from "@/lib/android-install/apk-download-client"

export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}

export type PwaPromptOutcome = "accepted" | "dismissed" | "unavailable"

export type PwaInstallDiagnostic = {
  hasDeferredPrompt: boolean
  bipEverReceived: boolean
  promptConsumed: boolean
  serviceWorkerReady: boolean
  serviceWorkerControlling: boolean
  isStandalone: boolean
  manifestOk: boolean | null
  lastPromptError: string | null
  installable: boolean
}

type Listener = () => void

let deferred: BeforeInstallPromptEvent | null = null
let bipEverReceived = false
let promptConsumed = false
let lastPromptError: string | null = null
let serviceWorkerReady = false
let serviceWorkerControlling = false
let manifestOk: boolean | null = null
let initialized = false
let probeLogged = false

const listeners = new Set<Listener>()

function notify(): void {
  listeners.forEach((fn) => fn())
}

export function getPwaInstallDiagnostic(): PwaInstallDiagnostic {
  const hasDeferredPrompt = deferred != null && typeof deferred.prompt === "function"
  const installable = hasDeferredPrompt && !promptConsumed && serviceWorkerReady && !isStandalonePwa()
  return {
    hasDeferredPrompt,
    bipEverReceived,
    promptConsumed,
    serviceWorkerReady,
    serviceWorkerControlling,
    isStandalone: isStandalonePwa(),
    manifestOk,
    lastPromptError,
    installable,
  }
}

export function hasValidDeferredPrompt(): boolean {
  const d = getPwaInstallDiagnostic()
  return d.hasDeferredPrompt && !d.promptConsumed
}

/** True only when prompt() can be called in a user gesture. */
export function canTriggerNativePwaInstall(): boolean {
  const d = getPwaInstallDiagnostic()
  return d.installable
}

export function subscribePwaInstall(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

async function refreshServiceWorkerState(): Promise<void> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return
  try {
    await navigator.serviceWorker.ready
    serviceWorkerReady = true
    serviceWorkerControlling = Boolean(navigator.serviceWorker.controller)
    const reg = await navigator.serviceWorker.getRegistration("/")
    if (reg?.active) serviceWorkerControlling = true
  } catch {
    serviceWorkerReady = false
  }
  notify()
}

async function probeManifest(): Promise<void> {
  try {
    const res = await fetch("/manifest.webmanifest", { cache: "no-store" })
    manifestOk = res.ok
  } catch {
    manifestOk = false
  }
  notify()
}

function logProbeOnce(): void {
  if (probeLogged || typeof window === "undefined") return
  probeLogged = true
  const diag = getPwaInstallDiagnostic()
  void logInstallEvent({
    event: "pwa_install_probe",
    detail: JSON.stringify({
      ...diag,
      ua: navigator.userAgent.slice(0, 120),
    }),
  })
}

/** Call once from root layout (PwaServiceWorkerRegister). */
export function initPwaInstallController(): void {
  if (initialized || typeof window === "undefined") return
  initialized = true

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault()
    deferred = e as BeforeInstallPromptEvent
    bipEverReceived = true
    promptConsumed = false
    lastPromptError = null
    void logInstallEvent({ event: "bip_received" })
    notify()
  })

  window.addEventListener("appinstalled", () => {
    deferred = null
    promptConsumed = true
    void logInstallEvent({ event: "pwa_installed" })
    notify()
  })

  void refreshServiceWorkerState()
  void probeManifest()

  window.setTimeout(() => {
    logProbeOnce()
    notify()
  }, 3500)
}

export async function triggerNativePwaInstall(meta: {
  surface: string
  browser: string | null
  version?: string | null
}): Promise<PwaPromptOutcome> {
  if (!hasValidDeferredPrompt() || !serviceWorkerReady) {
    void logInstallEvent({
      event: "pwa_prompt_unavailable",
      surface: meta.surface,
      browser: meta.browser,
      version: meta.version,
      detail: JSON.stringify(getPwaInstallDiagnostic()),
    })
    return "unavailable"
  }

  const prompt = deferred!
  try {
    await prompt.prompt()
    const choice = await prompt.userChoice
    deferred = null
    promptConsumed = true
    void logInstallEvent({
      event: "pwa_prompt_result",
      surface: meta.surface,
      browser: meta.browser,
      version: meta.version,
      detail: choice.outcome,
    })
    notify()
    return choice.outcome
  } catch (e) {
    lastPromptError = e instanceof Error ? e.message : "prompt_failed"
    deferred = null
    promptConsumed = true
    void logInstallEvent({
      event: "pwa_prompt_error",
      surface: meta.surface,
      browser: meta.browser,
      version: meta.version,
      detail: lastPromptError,
    })
    notify()
    return "unavailable"
  }
}
