"use client"

import { useState } from "react"

type ApplyForm = {
  fullName: string
  region: string
  phone: string
  paymentMethod: string
  whatsappContact: string
}

export default function RetailerApplyPage() {
  const [form, setForm] = useState<ApplyForm>({
    fullName: "",
    region: "UG",
    phone: "",
    paymentMethod: "",
    whatsappContact: "",
  })
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const response = await fetch("/api/retailer/apply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    })

    if (response.ok) setSubmitted(true)
    else {
      const body = (await response.json().catch(() => ({}))) as { error?: string }
      setError(body.error ?? "Could not submit application.")
    }
  }

  if (submitted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#070a12] p-6">
        <div className="max-w-md rounded-lg border border-[#1E2028] bg-[#111318] p-8 text-center">
          <div className="mb-4 text-5xl text-green-400">OK</div>
          <h2 className="mb-2 text-2xl font-bold text-white">Application Submitted</h2>
          <p className="mb-4 text-gray-400">
            Contact Nexus Admin on WhatsApp with your referral code to complete verification.
          </p>
          <p className="text-sm text-gray-500">You will be notified once your account is activated.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#070a12] p-6">
      <div className="mx-auto max-w-md">
        <h1 className="mb-6 text-2xl font-bold text-cyan-400">Apply to Become a Retailer</h1>

        <div className="mb-6 rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-4 text-sm text-yellow-300">
          Retailer registration requires identity/payment verification by Nexus Administration before activation.
          Applicants must comply with operational and regional verification requirements.
        </div>

        {error ? <p className="mb-4 text-sm text-red-400">{error}</p> : null}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm text-gray-300">Full Legal Name</label>
            <input
              type="text"
              required
              className="w-full rounded-lg border border-[#1E2028] bg-[#0A0B0E] p-3 text-white"
              value={form.fullName}
              onChange={(e) => setForm({ ...form, fullName: e.target.value })}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm text-gray-300">Region/Country</label>
            <select
              required
              className="w-full rounded-lg border border-[#1E2028] bg-[#0A0B0E] p-3 text-white"
              value={form.region}
              onChange={(e) => setForm({ ...form, region: e.target.value })}
            >
              <option value="UG">Uganda (UGX)</option>
              <option value="KE">Kenya (KES)</option>
              <option value="NG">Nigeria (NGN)</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm text-gray-300">Phone Number</label>
            <input
              type="tel"
              required
              className="w-full rounded-lg border border-[#1E2028] bg-[#0A0B0E] p-3 text-white"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm text-gray-300">Preferred Payment Method</label>
            <input
              type="text"
              placeholder="e.g., Mobile Money, Bank Transfer"
              className="w-full rounded-lg border border-[#1E2028] bg-[#0A0B0E] p-3 text-white"
              value={form.paymentMethod}
              onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm text-gray-300">WhatsApp Contact</label>
            <input
              type="text"
              required
              placeholder="+256XXXXXXXXX"
              className="w-full rounded-lg border border-[#1E2028] bg-[#0A0B0E] p-3 text-white"
              value={form.whatsappContact}
              onChange={(e) => setForm({ ...form, whatsappContact: e.target.value })}
            />
          </div>

          <button
            type="submit"
            className="w-full rounded-lg bg-cyan-600 py-3 font-bold text-white transition hover:bg-cyan-700"
          >
            Submit Application
          </button>
        </form>
      </div>
    </div>
  )
}
