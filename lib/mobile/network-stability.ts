/** Debounced connection phases — tolerates brief mobile network blips. */

export type ConnectionPhase = "online" | "degraded" | "offline"

export const NETWORK_STABILITY = {
  /** Unstable signal before showing lightweight reconnect strip */
  DEGRADED_AFTER_MS: 2500,
  /** Sustained outage before confirmed offline strip */
  OFFLINE_AFTER_MS: 8000,
  /** Confirm browser `online` before clearing offline/degraded UI */
  RECOVERY_DEBOUNCE_MS: 450,
  /** Rolling window for counting API fetch failures */
  FAILURE_WINDOW_MS: 12000,
  /** Failures while browser reports online before treating as unstable */
  FETCH_FAILURES_FOR_UNSTABLE: 2,
  /** Health probe interval while degraded */
  PROBE_INTERVAL_MS: 5000,
  PROBE_TIMEOUT_MS: 8000,
} as const

export type NetworkStabilitySnapshot = {
  phase: ConnectionPhase
  browserOnline: boolean
}

export type NetworkStabilityEvent =
  | { type: "phase"; snapshot: NetworkStabilitySnapshot }
  | { type: "reconnected"; snapshot: NetworkStabilitySnapshot }

export type NetworkStabilityMonitor = {
  reportFetchFailure: (url: string) => void
  reportFetchSuccess: (url: string) => void
  destroy: () => void
}

function isNexusApiUrl(url: string): boolean {
  try {
    const parsed = new URL(url, typeof window !== "undefined" ? window.location.origin : "https://localhost")
    return parsed.origin === (typeof window !== "undefined" ? window.location.origin : parsed.origin) &&
      parsed.pathname.startsWith("/api/")
  } catch {
    return false
  }
}

export function createNetworkStabilityMonitor(
  emit: (event: NetworkStabilityEvent) => void,
): NetworkStabilityMonitor {
  let phase: ConnectionPhase = "online"
  let browserOnline = typeof navigator !== "undefined" ? navigator.onLine : true
  let instabilityStartedAt: number | null = null
  let degradedTimer: ReturnType<typeof setTimeout> | null = null
  let offlineTimer: ReturnType<typeof setTimeout> | null = null
  let recoveryTimer: ReturnType<typeof setTimeout> | null = null
  let probeTimer: ReturnType<typeof setInterval> | null = null
  let fetchFailureTimes: number[] = []

  const snapshot = (): NetworkStabilitySnapshot => ({ phase, browserOnline })

  const publishPhase = () => {
    emit({ type: "phase", snapshot: snapshot() })
  }

  const setPhase = (next: ConnectionPhase) => {
    if (phase === next) return
    phase = next
    publishPhase()
  }

  const clearInstabilityTimers = () => {
    if (degradedTimer) clearTimeout(degradedTimer)
    if (offlineTimer) clearTimeout(offlineTimer)
    degradedTimer = null
    offlineTimer = null
    instabilityStartedAt = null
  }

  const clearRecoveryTimer = () => {
    if (recoveryTimer) clearTimeout(recoveryTimer)
    recoveryTimer = null
  }

  const stopProbe = () => {
    if (probeTimer) clearInterval(probeTimer)
    probeTimer = null
  }

  const stillUnstable = () => {
    if (!browserOnline) return true
    const now = Date.now()
    fetchFailureTimes = fetchFailureTimes.filter((t) => now - t < NETWORK_STABILITY.FAILURE_WINDOW_MS)
    return fetchFailureTimes.length >= NETWORK_STABILITY.FETCH_FAILURES_FOR_UNSTABLE
  }

  const startProbe = () => {
    stopProbe()
    probeTimer = setInterval(() => {
      if (!browserOnline) return
      void fetch("/api/health", {
        cache: "no-store",
        signal: AbortSignal.timeout(NETWORK_STABILITY.PROBE_TIMEOUT_MS),
      })
        .then((res) => {
          if (res.ok) completeRecovery(false)
        })
        .catch(() => {
          /* remain degraded/offline until browser or probe succeeds */
        })
    }, NETWORK_STABILITY.PROBE_INTERVAL_MS)
  }

  const beginInstabilityWatch = () => {
    if (instabilityStartedAt !== null) return
    instabilityStartedAt = Date.now()

    degradedTimer = setTimeout(() => {
      if (phase !== "online") return
      if (stillUnstable()) {
        setPhase("degraded")
        startProbe()
      }
    }, NETWORK_STABILITY.DEGRADED_AFTER_MS)

    offlineTimer = setTimeout(() => {
      if (stillUnstable() || !browserOnline) {
        stopProbe()
        setPhase("offline")
      }
    }, NETWORK_STABILITY.OFFLINE_AFTER_MS)
  }

  const completeRecovery = (fromOffline: boolean) => {
    fetchFailureTimes = []
    clearInstabilityTimers()
    clearRecoveryTimer()
    stopProbe()

    const prev = phase
    phase = "online"
    if (fromOffline && prev === "offline") {
      emit({ type: "reconnected", snapshot: snapshot() })
    } else {
      publishPhase()
    }
  }

  const signalInstability = () => {
    clearRecoveryTimer()
    beginInstabilityWatch()
  }

  const onBrowserOffline = () => {
    browserOnline = false
    publishPhase()
    signalInstability()
  }

  const onBrowserOnline = () => {
    browserOnline = true
    publishPhase()
    clearRecoveryTimer()
    recoveryTimer = setTimeout(() => {
      if (!browserOnline) return
      const fromOffline = phase === "offline"
      if (phase === "offline" || phase === "degraded") {
        completeRecovery(fromOffline)
      } else {
        fetchFailureTimes = []
        clearInstabilityTimers()
      }
    }, NETWORK_STABILITY.RECOVERY_DEBOUNCE_MS)
  }

  window.addEventListener("offline", onBrowserOffline)
  window.addEventListener("online", onBrowserOnline)

  const reportFetchFailure = (url: string) => {
    if (!isNexusApiUrl(url)) return
    clearRecoveryTimer()
    const now = Date.now()
    fetchFailureTimes.push(now)
    fetchFailureTimes = fetchFailureTimes.filter((t) => now - t < NETWORK_STABILITY.FAILURE_WINDOW_MS)

    if (browserOnline && fetchFailureTimes.length < NETWORK_STABILITY.FETCH_FAILURES_FOR_UNSTABLE) {
      return
    }
    signalInstability()
  }

  const reportFetchSuccess = (url: string) => {
    if (!isNexusApiUrl(url)) return
    fetchFailureTimes = []
    if (phase === "degraded" && browserOnline) {
      completeRecovery(false)
      return
    }
    if (phase === "online") {
      clearInstabilityTimers()
    }
  }

  const destroy = () => {
    window.removeEventListener("offline", onBrowserOffline)
    window.removeEventListener("online", onBrowserOnline)
    clearInstabilityTimers()
    clearRecoveryTimer()
    stopProbe()
  }

  return { reportFetchFailure, reportFetchSuccess, destroy }
}

/** Patch fetch once to feed API failure/success into the stability monitor. */
export function attachFetchStabilityReporter(
  monitor: Pick<NetworkStabilityMonitor, "reportFetchFailure" | "reportFetchSuccess">,
): () => void {
  if (typeof window === "undefined") return () => undefined
  const original = window.fetch.bind(window)

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url

    try {
      const response = await original(input, init)
      if (response.ok) monitor.reportFetchSuccess(url)
      return response
    } catch (error) {
      monitor.reportFetchFailure(url)
      throw error
    }
  }

  return () => {
    window.fetch = original
  }
}
