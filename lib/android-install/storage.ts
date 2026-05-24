import {
  ANDROID_INSTALL_AUTH_DISMISS_KEY,
  ANDROID_INSTALL_REMIND_SNOOZE_KEY,
  ANDROID_INSTALL_STORAGE_KEY,
  ANDROID_INSTALL_REMIND_SNOOZE_DAYS,
} from "@/lib/android-install/config"

export type AndroidInstallPersistedState = {
  installedVersion?: string
  installMode?: "pwa" | "apk"
  installedAt?: number
  lastSeenReleaseVersion?: string
}

function readJson<T>(key: string): T | null {
  if (typeof window === "undefined") return null
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

function writeJson(key: string, value: unknown): void {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* private mode */
  }
}

export function readInstallState(): AndroidInstallPersistedState {
  return readJson<AndroidInstallPersistedState>(ANDROID_INSTALL_STORAGE_KEY) ?? {}
}

export function writeInstallState(patch: Partial<AndroidInstallPersistedState>): void {
  writeJson(ANDROID_INSTALL_STORAGE_KEY, { ...readInstallState(), ...patch })
}

export function markAuthInstallDismissed(): void {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(ANDROID_INSTALL_AUTH_DISMISS_KEY, "1")
  } catch {
    /* ignore */
  }
}

export function isAuthInstallDismissed(): boolean {
  if (typeof window === "undefined") return false
  try {
    return localStorage.getItem(ANDROID_INSTALL_AUTH_DISMISS_KEY) === "1"
  } catch {
    return false
  }
}

export function snoozeDashboardInstallReminder(): void {
  if (typeof window === "undefined") return
  const until = Date.now() + ANDROID_INSTALL_REMIND_SNOOZE_DAYS * 86_400_000
  try {
    localStorage.setItem(ANDROID_INSTALL_REMIND_SNOOZE_KEY, String(until))
  } catch {
    /* ignore */
  }
}

export function isDashboardInstallReminderSnoozed(): boolean {
  if (typeof window === "undefined") return false
  try {
    const raw = localStorage.getItem(ANDROID_INSTALL_REMIND_SNOOZE_KEY)
    if (!raw) return false
    const until = Number(raw)
    return Number.isFinite(until) && Date.now() < until
  } catch {
    return false
  }
}

export function markInstalled(mode: "pwa" | "apk", version: string): void {
  writeInstallState({
    installMode: mode,
    installedVersion: version,
    installedAt: Date.now(),
  })
}
