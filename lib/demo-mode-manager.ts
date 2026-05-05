/**
 * Demo mode: only the final exchange send should be suppressed.
 * In-memory state — works for single Node process (e.g. PM2); not shared across serverless instances.
 */

let demoModeActive = false
let demoModeExpiryMs = 0
let autoDisableTimer: ReturnType<typeof setTimeout> | null = null

export function isDemoModeEnabled(): boolean {
  /** Demo / paper suppression must not block real broker sends when live trading is on. */
  if (process.env.NEXUS_REAL_TRADING === "1") return false
  if (!demoModeActive) return false
  if (Date.now() > demoModeExpiryMs) {
    disableDemoMode()
    return false
  }
  return true
}

export function enableDemoMode(durationMinutes: number = 5): void {
  if (process.env.NEXUS_REAL_TRADING === "1") {
    console.warn("[demo-mode] enableDemoMode ignored while NEXUS_REAL_TRADING=1")
    return
  }
  demoModeActive = true
  demoModeExpiryMs = Date.now() + durationMinutes * 60 * 1000
  if (autoDisableTimer) clearTimeout(autoDisableTimer)
  autoDisableTimer = setTimeout(() => {
    disableDemoMode()
  }, durationMinutes * 60 * 1000)
}

export function disableDemoMode(): void {
  demoModeActive = false
  demoModeExpiryMs = 0
  if (autoDisableTimer) {
    clearTimeout(autoDisableTimer)
    autoDisableTimer = null
  }
}

export function getDemoModeExpiryMs(): number {
  return demoModeExpiryMs
}

export function getRemainingSeconds(): number {
  if (!demoModeActive || !demoModeExpiryMs) return 0
  return Math.max(0, Math.floor((demoModeExpiryMs - Date.now()) / 1000))
}
