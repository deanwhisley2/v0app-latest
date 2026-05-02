'use client'

import { useEffect, useRef, useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'

const EMAIL_OTP_TYPES = [
  'signup',
  'invite',
  'magiclink',
  'recovery',
  'email_change',
  'email',
] as const

type EmailOtpType = (typeof EMAIL_OTP_TYPES)[number]

function parseEmailOtpType(raw: string | null): EmailOtpType {
  const t = raw?.toLowerCase()
  if (t && (EMAIL_OTP_TYPES as readonly string[]).includes(t)) {
    return t as EmailOtpType
  }
  return 'signup'
}

function VerifyContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const email = searchParams.get('email') ?? ''

  const token =
    searchParams.get('token_hash') ?? searchParams.get('token')

  const [status, setStatus] = useState<
    'verifying' | 'success' | 'error' | 'pending'
  >(() => {
    if (token) return 'verifying'
    if (email) return 'pending'
    return 'error'
  })
  const [error, setError] = useState(() =>
    !token && !email ? 'No verification token found' : ''
  )
  const [resendBusy, setResendBusy] = useState(false)
  const [resendMsg, setResendMsg] = useState('')

  const runIdRef = useRef(0)

  useEffect(() => {
    const nextToken =
      searchParams.get('token_hash') ?? searchParams.get('token')
    if (!nextToken) return

    const myId = ++runIdRef.current
    setStatus('verifying')
    setError('')

    const type = parseEmailOtpType(searchParams.get('type'))

    void (async () => {
      const { error: verifyError } = await supabase.auth.verifyOtp({
        token_hash: nextToken,
        type,
      })

      if (myId !== runIdRef.current) return

      if (verifyError) {
        setStatus('error')
        setError(verifyError.message)
      } else {
        setStatus('success')
        setTimeout(() => {
          router.push('/auth/login?verified=true')
        }, 2000)
      }
    })()
  }, [searchParams, router])

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md rounded-lg bg-white p-8 shadow-md">
        <h1 className="mb-4 text-center text-2xl font-bold text-gray-900">
          Verify your email
        </h1>

        {status === 'verifying' && (
          <p className="text-center text-gray-600">Verifying your email…</p>
        )}

        {status === 'success' && (
          <div className="space-y-3 text-center">
            <div className="rounded-md bg-green-100 p-3 text-green-700">
              ✓ Email verified! Redirecting to login…
            </div>
          </div>
        )}

        {status === 'error' && (
          <div className="rounded-md bg-red-100 p-3 text-center text-red-700">
            {error || 'Verification failed'}
          </div>
        )}

        {status === 'pending' && (
          <div className="space-y-4">
            <p className="text-center text-gray-600">
              We sent a verification link to{' '}
              <strong className="text-blue-600">{email}</strong>. Open the link
              in this browser to confirm your account.
            </p>
            {resendMsg && (
              <div className="rounded-md bg-blue-50 p-3 text-center text-sm text-blue-800">
                {resendMsg}
              </div>
            )}
            <button
              type="button"
              disabled={resendBusy || !email}
              onClick={async () => {
                setResendMsg('')
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
                    setResendMsg(data.message ?? 'Check your inbox for a new link.')
                  } else {
                    setResendMsg(data.error ?? 'Could not resend. Try again.')
                  }
                } catch {
                  setResendMsg('Network error. Please try again.')
                }
                setResendBusy(false)
              }}
              className="w-full rounded-md bg-blue-600 py-3 text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-400"
            >
              {resendBusy ? 'Sending…' : 'Resend verification email'}
            </button>
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
