'use client'

import { useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'

function VerifyContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const email = searchParams.get('email') || ''
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const res = await fetch('/api/auth/verify-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, code })
    })

    if (res.ok) {
      setSuccess(true)
      setTimeout(() => {
        router.push('/auth/login?verified=true')
      }, 2000)
    } else {
      const data = await res.json()
      setError(data.error || 'Invalid or expired code')
      setLoading(false)
    }
  }

  // NO ERROR ON LOAD - just show the form
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-md p-8 space-y-6 bg-white rounded-lg shadow-md">
        <h1 className="text-2xl font-bold text-center text-gray-900">Verify Your Email</h1>
        
        {!success ? (
          <>
            <p className="text-center text-gray-600">
              Enter the 6-digit code sent to <strong className="text-blue-600">{email}</strong>
            </p>
            
            {error && (
              <div className="p-3 text-red-700 bg-red-100 rounded-md">
                {error}
              </div>
            )}

            <form onSubmit={handleVerify} className="space-y-4">
              <input
                type="text"
                maxLength={6}
                placeholder="000000"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="w-full p-3 text-2xl text-center tracking-widest border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
                required
              />
              
              <button
                type="submit"
                disabled={loading || code.length !== 6}
                className="w-full py-3 text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition"
              >
                {loading ? 'Verifying...' : 'Verify & Continue'}
              </button>
            </form>
          </>
        ) : (
          <div className="text-center">
            <div className="p-3 text-green-700 bg-green-100 rounded-md mb-4">
              ✓ Email verified successfully!
            </div>
            <p className="text-gray-600">Redirecting to login...</p>
          </div>
        )}

        <p className="text-xs text-center text-gray-500 mt-4">
          Didn't receive code?{' '}
          <button 
            onClick={async () => {
              setError('')
              setLoading(true)
              try {
                const res = await fetch('/api/auth/send-verification', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ email })
                })
                if (res.ok) setError('New code sent! Check your email.')
                else setError('Failed to resend code. Please try again.')
              } catch (err) {
                setError('Network error. Please try again.')
              }
              setLoading(false)
            }}
            className="text-blue-600 hover:underline"
          >
            Click here to resend
          </button>
        </p>
      </div>
    </div>
  )
}

export default function VerifyPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center">Loading...</div>}>
      <VerifyContent />
    </Suspense>
  )
}
