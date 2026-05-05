'use client'

import { useEffect, useState, Suspense, type FormEvent } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from '@/components/ui/input-otp'

function VerifyContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [email, setEmail] = useState('')

  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [infoMsg, setInfoMsg] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [resendLoading, setResendLoading] = useState(false)

  useEffect(() => {
    const fromQuery = searchParams.get('email')?.trim() ?? ''
    let fromSession = ''
    try {
      fromSession = sessionStorage.getItem('nexus_pending_verify_email')?.trim() ?? ''
    } catch {
      /* ignore */
    }
    const resolved = fromQuery || fromSession
    if (!resolved) return
    setEmail(resolved)
    try {
      sessionStorage.setItem('nexus_pending_verify_email', resolved)
    } catch {
      /* ignore */
    }
    if (fromQuery && typeof window !== 'undefined') {
      const cleanPath = `${window.location.origin}/auth/verify`
      window.history.replaceState({}, '', cleanPath)
    }
  }, [searchParams])

  const handleVerify = async (e: FormEvent) => {
    e.preventDefault()
    const digits = code.replace(/\D/g, '').slice(0, 6)
    if (!email || digits.length !== 6) return

    setLoading(true)
    setError('')
    setInfoMsg('')

    try {
      const res = await fetch('/api/auth/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code: digits }),
      })
      const data = (await res.json().catch(() => ({}))) as {
        error?: string
        message?: string
      }

      if (!res.ok) {
        setError(data.error ?? 'Invalid or expired code')
        setLoading(false)
        return
      }

      setSuccess(true)
      setLoading(false)
      setTimeout(() => {
        router.push('/auth/login?verified=true')
      }, 2000)
    } catch {
      setError('Network error. Please try again.')
      setLoading(false)
    }
  }

  const handleResend = async () => {
    if (!email) {
      setError('No email address found.')
      setInfoMsg('')
      return
    }

    setResendLoading(true)
    setError('')
    setInfoMsg('')

    try {
      const res = await fetch('/api/auth/send-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = (await res.json().catch(() => ({}))) as {
        error?: string
        message?: string
      }

      if (!res.ok) {
        setError(data.error ?? 'Failed to resend code.')
      } else {
        setInfoMsg(data.message ?? 'New code sent! Check your email.')
      }
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setResendLoading(false)
    }
  }

  if (!email) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-md rounded-lg bg-white p-8 text-center shadow-md">
          <h1 className="text-xl font-semibold text-gray-900">
            Missing email address
          </h1>
          <p className="mt-3 text-gray-600">
            Go back and complete registration to continue verification.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md space-y-6 rounded-lg bg-white p-8 shadow-md">
        <h1 className="text-center text-2xl font-bold text-gray-900">
          Verify your email
        </h1>

        {!success ? (
          <>
            <p className="text-center text-gray-600">
              Enter the 6-digit code sent to{' '}
              <strong className="text-blue-600">{email}</strong>
            </p>

            {error && (
              <div className="rounded-md bg-red-100 p-3 text-center text-sm text-red-800">
                {error}
              </div>
            )}
            {infoMsg && (
              <div className="rounded-md bg-blue-50 p-3 text-center text-sm text-blue-800">
                {infoMsg}
              </div>
            )}

            <form onSubmit={handleVerify} className="space-y-6">
              <div className="flex justify-center">
                <InputOTP
                  maxLength={6}
                  value={code}
                  onChange={(v) =>
                    setCode(v.replace(/\D/g, '').slice(0, 6))
                  }
                  disabled={loading}
                  containerClassName="gap-2"
                >
                  <InputOTPGroup className="gap-3">
                    {Array.from({ length: 6 }, (_, i) => (
                      <InputOTPSlot
                        key={i}
                        index={i}
                        className="size-12 rounded-lg border-2 border-gray-200 text-lg font-semibold shadow-sm first:rounded-lg last:rounded-lg first:border-l-2 last:border-r-2 data-[active=true]:z-10 data-[active=true]:border-blue-500 data-[active=true]:ring-[3px] data-[active=true]:ring-blue-500/25"
                      />
                    ))}
                  </InputOTPGroup>
                </InputOTP>
              </div>

              <button
                type="submit"
                disabled={loading || code.replace(/\D/g, '').length !== 6}
                className="w-full rounded-md bg-blue-600 py-3 font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-400"
              >
                {loading ? 'Verifying…' : 'Verify & continue'}
              </button>
            </form>

            <button
              type="button"
              onClick={() => void handleResend()}
              disabled={resendLoading || loading}
              className="w-full text-center text-sm text-blue-600 hover:text-blue-800 disabled:text-gray-400"
            >
              {resendLoading
                ? 'Sending…'
                : "Didn't receive a code? Click here to resend"}
            </button>
          </>
        ) : (
          <div className="text-center">
            <div className="mb-4 rounded-md bg-green-100 p-3 text-green-800">
              ✓ Email verified successfully!
            </div>
            <p className="text-gray-600">Redirecting to login…</p>
          </div>
        )}
      </div>
    </div>
  )
}

export default function VerifyPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-gray-50">
          Loading…
        </div>
      }
    >
      <VerifyContent />
    </Suspense>
  )
}
