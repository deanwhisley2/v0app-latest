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
import { useRouter } from "next/navigation"
import type { Session, User } from "@supabase/supabase-js"
import { supabase } from "@/lib/supabaseClient"
import { isDevLocalOnly } from "@/lib/dev-local-mode"
import { DevLocalFetchGate } from "@/components/DevLocalFetchGate"
import { createGuestUser, isGuestLoginEnabled } from "@/lib/free-entry"

type AuthContextValue = {
  user: User | null
  session: Session | null
  /** True when using synthetic guest (no Supabase session). */
  isGuestSession: boolean
  isLoading: boolean
  signOut: () => Promise<{ error: Error | null }>
  refreshSession: () => Promise<void>
  /** After leaving guest mode, call this to browse as guest again (free entry only). */
  reenterGuestMode: () => void
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

/** Slow mobile networks can exceed 8s; premature false here caused silent login redirects. */
const AUTH_BOOT_MS = 25_000

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter()
  const [session, setSession] = useState<Session | null>(null)
  const [isLoading, setIsLoading] = useState(() => !isDevLocalOnly())
  /** When true, do not synthesize guest (user chose “real login only” after sign-out). */
  const [guestDeclined, setGuestDeclined] = useState(false)
  const bootDoneRef = useRef(isDevLocalOnly())

  useEffect(() => {
    if (isDevLocalOnly()) return
    const t = window.setTimeout(() => {
      if (bootDoneRef.current) return
      void supabase.auth
        .getSession()
        .then(({ data, error }) => {
          if (bootDoneRef.current) return
          if (error) console.error("Auth getSession (boot timeout retry):", error.message)
          else setSession(data.session)
        })
        .catch((e: unknown) => {
          if (!bootDoneRef.current) console.error("Auth getSession boot timeout retry failed:", e)
        })
        .finally(() => {
          if (bootDoneRef.current) return
          bootDoneRef.current = true
          setIsLoading(false)
        })
    }, AUTH_BOOT_MS)
    return () => window.clearTimeout(t)
  }, [])

  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      isGuestLoginEnabled() &&
      sessionStorage.getItem("nexus_guest_enter") === "1"
    ) {
      sessionStorage.removeItem("nexus_guest_enter")
      setGuestDeclined(false)
    }
  }, [session])

  useEffect(() => {
    if (isDevLocalOnly()) {
      setSession(null)
      setIsLoading(false)
      bootDoneRef.current = true
      return
    }

    let cancelled = false

    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          console.error("Auth getSession:", error.message)
          setSession(null)
        } else {
          setSession(data.session)
        }
        bootDoneRef.current = true
        setIsLoading(false)
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          console.error("Auth getSession failed:", e)
          setSession(null)
          bootDoneRef.current = true
          setIsLoading(false)
        }
      })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!cancelled) {
        setSession(nextSession)
        if (nextSession?.user) setGuestDeclined(false)
        bootDoneRef.current = true
        setIsLoading(false)
        if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "SIGNED_OUT") {
          router.refresh()
        }
      }
    })

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [router])

  const reenterGuestMode = useCallback(() => {
    setGuestDeclined(false)
  }, [])

  const signOut = useCallback(async () => {
    try {
      if (!isDevLocalOnly()) {
        const { error } = await supabase.auth.signOut()
        if (error) return { error: new Error(error.message) }
      }
      setSession(null)
      if (isGuestLoginEnabled()) setGuestDeclined(true)
      return { error: null }
    } catch (e) {
      const err = e instanceof Error ? e : new Error("Sign out failed")
      return { error: err }
    }
  }, [])

  const refreshSession = useCallback(async () => {
    if (isDevLocalOnly()) return
    const { data, error } = await supabase.auth.getSession()
    if (error) {
      console.error("refreshSession:", error.message)
      return
    }
    setSession(data.session)
  }, [])

  const { resolvedUser, isGuestSession } = useMemo(() => {
    if (session?.user) {
      return { resolvedUser: session.user, isGuestSession: false }
    }
    if (isDevLocalOnly() && !guestDeclined) {
      return { resolvedUser: createGuestUser(), isGuestSession: true }
    }
    if (isGuestLoginEnabled() && !guestDeclined && !isLoading) {
      return { resolvedUser: createGuestUser(), isGuestSession: true }
    }
    return { resolvedUser: null, isGuestSession: false }
  }, [session, guestDeclined, isLoading])

  const value = useMemo<AuthContextValue>(
    () => ({
      user: resolvedUser,
      session,
      isGuestSession,
      isLoading,
      signOut,
      refreshSession,
      reenterGuestMode,
    }),
    [resolvedUser, session, isGuestSession, isLoading, signOut, refreshSession, reenterGuestMode]
  )

  return (
    <AuthContext.Provider value={value}>
      <DevLocalFetchGate />
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (ctx === undefined) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return ctx
}
