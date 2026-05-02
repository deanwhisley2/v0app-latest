"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import type { Session, User } from "@supabase/supabase-js"
import { supabase } from "@/lib/supabaseClient"

type AuthContextValue = {
  user: User | null
  session: Session | null
  isLoading: boolean
  signOut: () => Promise<{ error: Error | null }>
  refreshSession: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
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
        setIsLoading(false)
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          console.error("Auth getSession failed:", e)
          setSession(null)
          setIsLoading(false)
        }
      })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!cancelled) {
        setSession(nextSession)
        setIsLoading(false)
      }
    })

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [])

  const signOut = useCallback(async () => {
    try {
      const { error } = await supabase.auth.signOut()
      if (error) return { error: new Error(error.message) }
      setSession(null)
      return { error: null }
    } catch (e) {
      const err = e instanceof Error ? e : new Error("Sign out failed")
      return { error: err }
    }
  }, [])

  const refreshSession = useCallback(async () => {
    const { data, error } = await supabase.auth.getSession()
    if (error) {
      console.error("refreshSession:", error.message)
      return
    }
    setSession(data.session)
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      user: session?.user ?? null,
      session,
      isLoading,
      signOut,
      refreshSession,
    }),
    [session, isLoading, signOut, refreshSession]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (ctx === undefined) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return ctx
}
