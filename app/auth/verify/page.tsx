'use client'

import { useState, Suspense, type FormEvent } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from '@/components/ui/input-otp'

function VerifyContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const email = searchParams.get('email')?.trim() ?? ''

  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [resendBusy, setResendBusy] = useState(false)
  const [infoMsg, setInfoMsg] = useState('')

  const handleVerify = async (e: FormEvent) => {
    e.preventDefault()
    if (!email || code.replace(/\D/g, '').length !== 6) return

    setLoading(true)
    setError('')
    setInfoMsg('')

    const digits = code.replace(/\D/g, '').slice(0, 6)
    const { error: verifyError } = await supabase.auth.verifyOtp({
      email,
      token: digits,
      type: 'email',
    })

    setLoading(false)

    if (verifyError) {
      setError(verifyError.message)
      return
    }

    setSuccess(true)
    setTimeout(() => {
      router.push('/auth/login')
    }, 1500)
  }

  const handleResend = async () => {
    setError('')
    setInfoMsg('')
    setResendBusy(true)
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
      if (res.ok) {
        setInfoMsg(data.message ?? 'New code sent. Check your email.')
      } else {
        setError(data.error ?? 'Could not resend code.')
      }
    } catch {
      setError('Network error. Please try again.')
    }
    setResendBusy(false)
  }

  if (!email) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-md rounded-lg bg-white p-8 text-center shadow-md">
          <h1 className="text-xl font-semibold text-gray-900">
            Missing email address
          </h1>
          <p className="mt-3 text-gray-600">
            Open this page from your signup confirmation or use the link that
            includes <span className="font-mono text-sm">?email=</span> with your
            address.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md rounded-lg bg-white p-8 shadow-md">
        <h1 className="text-center text-2xl font-bold text-gray-900">
          Verify your email
        </h1>
        <p className="mt-2 text-center text-gray-600">
          Enter the 6-digit code sent to{' '}
          <strong className="text-blue-600">{email}</strong>
        </p>

        {success ? (
          <div className="mt-8 space-y-3 text-center">
            <div className="rounded-md bg-green-100 p-3 text-green-800">
              ✓ Email verified. Redirecting to login…
            </div>
          </div>
        ) : (
          <form onSubmit={handleVerify} className="mt-8 space-y-6">
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
              disabled={
                loading || code.replace(/\D/g, '').length !== 6
              }
              className="w-full rounded-md bg-blue-600 py-3 font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-400"
            >
              {loading ? 'Verifying…' : 'Verify & continue'}
            </button>
          </form>
        )}

        {!success && (
          <p className="mt-6 text-center text-xs text-gray-500">
            Didn&apos;t receive a code?{' '}
            <button
              type="button"
              disabled={resendBusy}
              onClick={() => void handleResend()}
              className="font-medium text-blue-600 hover:underline disabled:opacity-50"
            >
              {resendBusy ? 'Sending…' : 'Resend code'}
            </button>
          </p>
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
