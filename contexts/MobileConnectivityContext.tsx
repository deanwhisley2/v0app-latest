"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { NEXUS_NETWORK_RECONNECTED } from "@/lib/mobile/mobile-chrome-events"
import {
  attachFetchStabilityReporter,
  createNetworkStabilityMonitor,
  type ConnectionPhase,
} from "@/lib/mobile/network-stability"
import { gaEvent } from "@/lib/analytics/google-analytics"
import { isPwaSafeMode } from "@/lib/mobile/pwa-safe-mode"

export type MobileConnectivityState = {
  phase: ConnectionPhase
  /** True unless sustained offline — degraded still allows UI continuity */
  isOnline: boolean
  wasOffline: boolean
  reconnectCount: number
  dismissOfflineBanner: () => void
  showDegradedBanner: boolean
  showOfflineBanner: boolean
  showReconnectedBanner: boolean
}

const MobileConnectivityContext = createContext<MobileConnectivityState | undefined>(undefined)

const RECONNECTED_BANNER_MS = 2500

const STABLE_ONLINE: MobileConnectivityState = {
  phase: "online",
  isOnline: true,
  wasOffline: false,
  reconnectCount: 0,
  dismissOfflineBanner: () => undefined,
  showDegradedBanner: false,
  showOfflineBanner: false,
  showReconnectedBanner: false,
}

export function MobileConnectivityProvider({ children }: { children: ReactNode }) {
  if (isPwaSafeMode()) {
    return (
      <MobileConnectivityContext.Provider value={STABLE_ONLINE}>
        {children}
      </MobileConnectivityContext.Provider>
    )
  }
  return <MobileConnectivityMonitorProvider>{children}</MobileConnectivityMonitorProvider>
}

function MobileConnectivityMonitorProvider({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<ConnectionPhase>("online")
  const [wasOffline, setWasOffline] = useState(false)
  const [reconnectCount, setReconnectCount] = useState(0)
  const [offlineDismissed, setOfflineDismissed] = useState(false)
  const [showReconnected, setShowReconnected] = useState(false)
  const reconnectCountRef = useRef(0)

  useEffect(() => {
    if (typeof window === "undefined") return

    const monitor = createNetworkStabilityMonitor((event) => {
      if (event.type === "reconnected") {
        setPhase("online")
        setWasOffline(true)
        reconnectCountRef.current += 1
        setReconnectCount(reconnectCountRef.current)
        setShowReconnected(true)
        setOfflineDismissed(false)
        window.dispatchEvent(new CustomEvent(NEXUS_NETWORK_RECONNECTED))
        gaEvent("network_reconnected", { reconnect_count: reconnectCountRef.current })
        return
      }

      setPhase(event.snapshot.phase)

      if (event.snapshot.phase === "offline") {
        setWasOffline(false)
        setShowReconnected(false)
        setOfflineDismissed(false)
        gaEvent("network_offline")
        return
      }

      if (event.snapshot.phase === "degraded") {
        setShowReconnected(false)
        return
      }

      if (event.snapshot.phase === "online") {
        setShowReconnected(false)
      }
    })

    const detachFetch = attachFetchStabilityReporter(monitor)

    return () => {
      detachFetch()
      monitor.destroy()
    }
  }, [])

  useEffect(() => {
    if (!showReconnected) return
    const t = window.setTimeout(() => setShowReconnected(false), RECONNECTED_BANNER_MS)
    return () => window.clearTimeout(t)
  }, [showReconnected])

  const dismissOfflineBanner = useCallback(() => setOfflineDismissed(true), [])

  const value = useMemo<MobileConnectivityState>(
    () => ({
      phase,
      isOnline: phase !== "offline",
      wasOffline,
      reconnectCount,
      dismissOfflineBanner,
      showDegradedBanner: phase === "degraded",
      showOfflineBanner: phase === "offline" && !offlineDismissed,
      showReconnectedBanner: showReconnected && phase === "online",
    }),
    [phase, wasOffline, reconnectCount, dismissOfflineBanner, offlineDismissed, showReconnected],
  )

  return (
    <MobileConnectivityContext.Provider value={value}>{children}</MobileConnectivityContext.Provider>
  )
}

export function useMobileConnectivity(): MobileConnectivityState {
  const ctx = useContext(MobileConnectivityContext)
  if (!ctx) {
    return {
      phase: "online",
      isOnline: true,
      wasOffline: false,
      reconnectCount: 0,
      dismissOfflineBanner: () => undefined,
      showDegradedBanner: false,
      showOfflineBanner: false,
      showReconnectedBanner: false,
    }
  }
  return ctx
}
