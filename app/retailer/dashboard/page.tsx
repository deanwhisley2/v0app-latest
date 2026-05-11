import { redirect } from "next/navigation"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { getTradingUserLevel } from "@/lib/server/security-authz"

type PendingRequest = {
  id: string
  amount_local: number
  currency: string
  created_at: string
  status: string
}

type RetailerTransaction = {
  id: number
  created_at: string
  transaction_type: string
  amount_local: number
  currency: string
  status: string
}

export default async function RetailerDashboardPage() {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect("/auth/login")

  const level = await getTradingUserLevel(user.id)
  if (level !== 2) redirect("/dashboard")

  const admin = createAdminClient()

  const { data: balances, error: balancesError } = await admin
    .from("user_local_balances")
    .select("wallet_type,currency,amount")
    .eq("user_id", user.id)
    .eq("wallet_type", "RETAIL")

  if (balancesError) {
    throw new Error(balancesError.message)
  }

  const { data: pendingApprovals, error: pendingError } = await admin
    .from("pending_requests")
    .select("id,amount_local,currency,created_at,status")
    .eq("user_id", user.id)
    .eq("status", "PENDING")
    .order("created_at", { ascending: false })
    .limit(25)

  if (pendingError) {
    throw new Error(pendingError.message)
  }

  const { data: transactions, error: txError } = await admin
    .from("retailer_transactions")
    .select("id,created_at,transaction_type,amount_local,currency,status")
    .eq("retailer_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50)

  if (txError) {
    throw new Error(txError.message)
  }

  const retailBalance = Number(
    balances?.find((b: { currency?: string | null }) => (b.currency ?? "").toUpperCase() === "UGX")?.amount ?? 0
  )
  const retailUsd = Number(
    balances?.find((b: { currency?: string | null }) => (b.currency ?? "").toUpperCase() === "USD")?.amount ?? 0
  )

  return (
    <div className="min-h-screen bg-[#070a12] p-6">
      <h1 className="mb-6 text-2xl font-bold text-cyan-400">Retailer Dashboard</h1>

      <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="rounded-lg border border-[#1E2028] bg-[#111318] p-6">
          <h3 className="mb-2 text-sm text-gray-400">Available Nexus Balance</h3>
          <p className="text-3xl font-bold text-green-400">${retailUsd.toFixed(2)} USD</p>
        </div>
        <div className="rounded-lg border border-[#1E2028] bg-[#111318] p-6">
          <h3 className="mb-2 text-sm text-gray-400">Retailer Balance</h3>
          <p className="text-3xl font-bold text-cyan-400">{retailBalance.toLocaleString()} UGX</p>
        </div>
      </div>

      <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-lg border border-[#1E2028] bg-[#111318] p-4">
          <h3 className="text-sm text-gray-400">Add Funds</h3>
          <p className="mt-1 text-sm text-gray-300">Submit a top-up request from verified treasury channels.</p>
        </div>
        <div className="rounded-lg border border-[#1E2028] bg-[#111318] p-4">
          <h3 className="text-sm text-gray-400">Withdraw Funds</h3>
          <p className="mt-1 text-sm text-gray-300">Settle withdrawals through registered regional payment methods.</p>
        </div>
        <div className="rounded-lg border border-[#1E2028] bg-[#111318] p-4">
          <h3 className="text-sm text-gray-400">Notifications</h3>
          <p className="mt-1 text-sm text-gray-300">Track approval and settlement updates in operational history.</p>
        </div>
        <div className="rounded-lg border border-[#1E2028] bg-[#111318] p-4">
          <h3 className="text-sm text-gray-400">Referral Program</h3>
          <p className="mt-1 text-sm text-gray-300">Retailer referrals remain available under verified regional routing.</p>
        </div>
        <div className="rounded-lg border border-[#1E2028] bg-[#111318] p-4">
          <h3 className="text-sm text-gray-400">Account Security</h3>
          <p className="mt-1 text-sm text-gray-300">Use session/device controls and recovery options in security center.</p>
        </div>
        <div className="rounded-lg border border-[#1E2028] bg-[#111318] p-4">
          <h3 className="text-sm text-gray-400">Wallstreet</h3>
          <p className="mt-1 text-sm text-gray-300">Assets only. Trading and exchange-execution interfaces are blocked.</p>
        </div>
      </div>

      <div className="mb-8 rounded-lg border border-[#1E2028] bg-[#111318] p-6">
        <h2 className="mb-4 text-xl font-semibold text-white">Pending Approvals</h2>
        {(pendingApprovals as PendingRequest[] | null)?.length ? (
          <div className="space-y-3">
            {(pendingApprovals as PendingRequest[]).map((req) => (
              <div key={req.id} className="flex items-center justify-between rounded bg-[#0A0B0E] p-3">
                <div>
                  <p className="text-white">
                    {Number(req.amount_local).toLocaleString()} {req.currency}
                  </p>
                  <p className="text-xs text-gray-500">{new Date(req.created_at).toLocaleString()}</p>
                </div>
                <span className="rounded bg-yellow-500/20 px-2 py-1 text-xs text-yellow-300">{req.status}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500">No pending approvals</p>
        )}
      </div>

      <div className="rounded-lg border border-[#1E2028] bg-[#111318] p-6">
        <h2 className="mb-4 text-xl font-semibold text-white">Transaction History</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-700 text-gray-400">
              <tr>
                <th className="py-2 text-left">Date</th>
                <th className="py-2 text-left">Type</th>
                <th className="py-2 text-left">Amount</th>
                <th className="py-2 text-left">Status</th>
              </tr>
            </thead>
            <tbody>
              {(transactions as RetailerTransaction[] | null)?.map((tx) => (
                <tr key={tx.id} className="border-b border-gray-800">
                  <td className="py-2 text-gray-300">{new Date(tx.created_at).toLocaleDateString()}</td>
                  <td className="py-2 text-gray-300">{tx.transaction_type}</td>
                  <td className="py-2 text-gray-300">
                    {Number(tx.amount_local).toLocaleString()} {tx.currency}
                  </td>
                  <td className="py-2 text-green-400">{tx.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-xs text-gray-500">Transaction history is immutable and cannot be deleted.</p>
      </div>
    </div>
  )
}
