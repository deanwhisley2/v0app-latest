import { redirect } from "next/navigation"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { getTradingUserLevel } from "@/lib/server/security-authz"

type RetailerApplication = {
  id: string
  full_name: string
  region: string
  phone: string
  whatsapp_contact: string | null
}

type RetailerUser = {
  id: string
  region: string | null
  verified: boolean
}

export default async function AdminTreasuryPage() {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect("/auth/login")

  const level = await getTradingUserLevel(user.id)
  if (level !== 5) redirect("/dashboard")

  const admin = createAdminClient()
  const { data: treasury, error: treasuryError } = await admin
    .from("admin_treasury_pool")
    .select("balance_usd")
    .eq("id", 1)
    .single()
  if (treasuryError) throw new Error(treasuryError.message)

  const { data: retailers, error: retailersError } = await admin
    .from("users")
    .select("id,region,verified")
    .eq("role", "RETAILER")
    .order("updated_at", { ascending: false })
  if (retailersError) throw new Error(retailersError.message)

  const { data: pendingApps, error: appsError } = await admin
    .from("retailer_applications")
    .select("id,full_name,region,phone,whatsapp_contact")
    .eq("status", "PENDING")
    .order("created_at", { ascending: false })
  if (appsError) throw new Error(appsError.message)

  return (
    <div className="min-h-screen bg-[#070a12] p-6">
      <h1 className="mb-6 text-2xl font-bold text-cyan-400">Admin Treasury</h1>

      <div className="mb-8 rounded-lg border border-cyan-500/30 bg-gradient-to-r from-cyan-900/30 to-blue-900/30 p-8">
        <h3 className="mb-2 text-sm text-gray-400">Nexus Treasury Pool (USD)</h3>
        <p className="text-5xl font-bold text-cyan-400">${Number(treasury.balance_usd ?? 0).toFixed(2)}</p>
        <p className="mt-2 text-xs text-gray-500">This is the only admin treasury balance source.</p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-[#1E2028] bg-[#111318] p-6">
          <h2 className="mb-4 text-xl font-semibold text-white">Pending Retailer Applications</h2>
          {(pendingApps as RetailerApplication[] | null)?.length ? (
            <div className="space-y-3">
              {(pendingApps as RetailerApplication[]).map((app) => (
                <div key={app.id} className="rounded bg-[#0A0B0E] p-3">
                  <p className="font-medium text-white">{app.full_name}</p>
                  <p className="text-sm text-gray-400">
                    {app.region} | {app.phone}
                  </p>
                  <p className="text-sm text-gray-400">WhatsApp: {app.whatsapp_contact ?? "-"}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500">No pending applications</p>
          )}
        </div>

        <div className="rounded-lg border border-[#1E2028] bg-[#111318] p-6">
          <h2 className="mb-4 text-xl font-semibold text-white">Active Retailers</h2>
          <div className="space-y-2">
            {(retailers as RetailerUser[] | null)?.map((retailer) => (
              <div key={retailer.id} className="flex items-center justify-between border-b border-gray-800 p-2">
                <div>
                  <p className="text-sm text-white">{retailer.id}</p>
                  <p className="text-xs text-gray-500">
                    {retailer.region ?? "N/A"} | {retailer.verified ? "Verified" : "Pending"}
                  </p>
                </div>
                <span className="rounded bg-blue-600 px-3 py-1 text-xs text-white">Manage</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
