"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabaseClient"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export default function RegisterPage() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [fullName, setFullName] = useState("")
  const [phone, setPhone] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setIsSubmitting(true)
    try {
      const trimmedEmail = email.trim()
      const trimmedName = fullName.trim()
      const trimmedPhone = phone.trim()

      const { data, error: signUpError } = await supabase.auth.signUp({
        email: trimmedEmail,
        password,
        options: {
          data: {
            full_name: trimmedName,
            phone: trimmedPhone,
          },
        },
      })

      if (signUpError) {
        setError(signUpError.message)
        return
      }

      const userId = data.user?.id
      if (!userId) {
        setError("Could not create user. Try again or disable Supabase “Confirm email” if sessions are blocked.")
        return
      }

      const { error: profileError } = await supabase.from("profiles").insert({
        id: userId,
        email: trimmedEmail,
        full_name: trimmedName,
        phone: trimmedPhone,
        is_verified: false,
      })
      if (profileError) {
        setError(
          `Account created, but profile save failed: ${profileError.message}. Add column is_verified to profiles or fix RLS.`
        )
        return
      }

      const sendRes = await fetch("/api/auth/send-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmedEmail }),
      })
      const sendJson = (await sendRes.json().catch(() => ({}))) as { error?: string }
      if (!sendRes.ok) {
        setError(sendJson.error || "Account created but verification email failed. Use Resend API key on the server.")
        return
      }

      await supabase.auth.signOut()

      try {
        sessionStorage.setItem("nexus_pending_verify_email", trimmedEmail)
      } catch {
        /* ignore */
      }

      router.replace(`/auth/verify?email=${encodeURIComponent(trimmedEmail)}`)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-8 rounded-2xl border border-border bg-card p-8 shadow-xl">
        <div className="text-center">
          <p className="font-mono text-2xl font-black tracking-tight text-primary">NEXUS</p>
          <p className="text-xs font-bold tracking-[0.3em] text-cyan-400">PRO</p>
          <h1 className="mt-4 text-2xl font-semibold text-foreground">Create account</h1>
          <p className="mt-2 text-sm text-muted-foreground">Sign up with your details.</p>
        </div>

        <form className="space-y-6" onSubmit={handleSubmit} noValidate>
          <div className="space-y-2">
            <Label htmlFor="register-full-name">Full name</Label>
            <Input
              id="register-full-name"
              type="text"
              autoComplete="name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              disabled={isSubmitting}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="register-phone">Phone</Label>
            <Input
              id="register-phone"
              type="tel"
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
              disabled={isSubmitting}
              placeholder="+1 555 0100"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="register-email">Email</Label>
            <Input
              id="register-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={isSubmitting}
              placeholder="you@example.com"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="register-password">Password</Label>
            <Input
              id="register-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              disabled={isSubmitting}
            />
            <p className="text-xs text-muted-foreground">At least 6 characters (use a strong password).</p>
          </div>

          {error ? (
            <p className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? "Creating account…" : "Register"}
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/auth/login" className="font-medium text-primary underline-offset-4 hover:underline">
            Sign in
          </Link>
          {" · "}
          <Link href="/" className="underline-offset-4 hover:underline">
            Home
          </Link>
        </p>
      </div>
    </div>
  )
}
