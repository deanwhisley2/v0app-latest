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
import { gaEvent } from "@/lib/analytics/google-analytics"

export type MobileConnectivityState = {
  isOnline: boolean
  wasOffline: boolean
  reconnectCount: number
  dismissOfflineBanner: () => void
  showOfflineBanner: boolean
  showReconnectedBanner: boolean
}

const MobileConnectivityContext = createContext<MobileConnectivityState | undefined>(undefined)

const RECONNECT_BANNER_MS = 4000

export function MobileConnectivityProvider({ children }: { children: ReactNode }) {
  const [isOnline, setIsOnline] = useState(true)
  const [wasOffline, setWasOffline] = useState(false)
  const [reconnectCount, setReconnectCount] = useState(0)
  const [offlineDismissed, setOfflineDismissed] = useState(false)
  const [showReconnected, setShowReconnected] = useState(false)
  const hadOfflineRef = useRef(false)

  useEffect(() => {
    if (typeof window === "undefined") return
    const sync = () => setIsOnline(navigator.onLine)
    sync()
    window.addEventListener("online", sync)
    window.addEventListener("offline", sync)
    return () => {
      window.removeEventListener("online", sync)
      window.removeEventListener("offline", sync)
    }
  }, [])

  useEffect(() => {
    if (isOnline) {
      if (hadOfflineRef.current) {
        hadOfflineRef.current = false
        setWasOffline(true)
        setReconnectCount((c) => c + 1)
        setShowReconnected(true)
        setOfflineDismissed(false)
        window.dispatchEvent(new CustomEvent(NEXUS_NETWORK_RECONNECTED))
        gaEvent("network_reconnected", { reconnect_count: reconnectCount + 1 })
        const t = window.setTimeout(() => setShowReconnected(false), RECONNECT_BANNER_MS)
        return () => window.clearTimeout(t)
      }
      return
    }

    hadOfflineRef.current = true
    setWasOffline(false)
    setShowReconnected(false)
    setOfflineDismissed(false)
    gaEvent("network_offline")
  }, [isOnline, reconnectCount])

  const dismissOfflineBanner = useCallback(() => setOfflineDismissed(true), [])

  const value = useMemo<MobileConnectivityState>(
    () => ({
      isOnline,
      wasOffline,
      reconnectCount,
      dismissOfflineBanner,
      showOfflineBanner: !isOnline && !offlineDismissed,
      showReconnectedBanner: showReconnected && isOnline,
    }),
    [isOnline, wasOffline, reconnectCount, dismissOfflineBanner, offlineDismissed, showReconnected],
  )

  return (
    <MobileConnectivityContext.Provider value={value}>{children}</MobileConnectivityContext.Provider>
  )
}

export function useMobileConnectivity(): MobileConnectivityState {
  const ctx = useContext(MobileConnectivityContext)
  if (!ctx) {
    return {
      isOnline: true,
      wasOffline: false,
      reconnectCount: 0,
      dismissOfflineBanner: () => undefined,
      showOfflineBanner: false,
      showReconnectedBanner: false,
    }
  }
  return ctx
}
