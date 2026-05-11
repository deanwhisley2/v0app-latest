import { NextResponse } from "next/server"
import { bearerUserWithGovernance } from "@/lib/server/account-governance"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { getTradingUserLevel } from "@/lib/server/security-authz"

const HISTORY_DAYS = 7

type TimelineRow = {
  sortAt: string
  kind: "ledger" | "funding_req"
  id: string
  title: string
  subtitle: string | null
  amount: number | null
  status: string | null
  transactionRef: string | null
  network: string | null
}

export async function GET(request: Request) {
  try {
    const auth = await bearerUserWithGovernance(request, "read")
    if ("response" in auth) return auth.response
    const { user } = auth
    const level = await getTradingUserLevel(user.id)
    if (level !== 2 && level !== 5) {
      return NextResponse.json({ error: "Retailer operations history requires Level 2 or Level 5." }, { status: 403 })
    }

    const admin = createAdminClient()
    const { searchParams } = new URL(request.url)
    const targetRetailerUserId =
      level === 5 ? (searchParams.get("retailerUserId") ?? "").trim() || user.id : user.id
    const { data: desk } = await admin
      .from("retailer_profiles")
      .select("id")
      .eq("user_id", targetRetailerUserId)
      .maybeSingle()
    if (!desk?.id) {
      return NextResponse.json({ timeline: [], cutoffDays: HISTORY_DAYS })
    }

    const since = new Date(Date.now() - HISTORY_DAYS * 86_400_000).toISOString()

    const [evRes, reqRes] = await Promise.all([
      admin
        .from("container_balance_events")
        .select(
          "id,event_type,gross_amount,status,transaction_ref,summary,balance_source,balance_destination,created_at,metadata"
        )
        .eq("user_id", user.id)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(200),
      admin
        .from("retailer_fund_requests")
        .select(
          "id,amount,tx_reference,status,mobile_network,fund_channel,payer_display_name,payer_phone,created_at,appeal_note,escalated_to_admin"
        )
        .eq("retailer_id", desk.id)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(200),
    ])

    if (evRes.error) return NextResponse.json({ error: evRes.error.message }, { status: 500 })
    if (reqRes.error) return NextResponse.json({ error: reqRes.error.message }, { status: 500 })

    const timeline: TimelineRow[] = []

    for (const r of evRes.data ?? []) {
      timeline.push({
        sortAt: String(r.created_at ?? ""),
        kind: "ledger",
        id: String(r.id),
        title: String(r.event_type ?? "event").replace(/_/g, " "),
        subtitle: typeof r.summary === "string" ? r.summary : null,
        amount: r.gross_amount != null ? Number(r.gross_amount) : null,
        status: r.status != null ? String(r.status) : null,
        transactionRef: r.transaction_ref != null ? String(r.transaction_ref) : null,
        network: r.balance_source != null ? String(r.balance_source) : null,
      })
    }

    for (const r of reqRes.data ?? []) {
      const sender =
        typeof r.payer_display_name === "string" && r.payer_phone
          ? `${r.payer_display_name} · ${r.payer_phone}`
          : typeof r.payer_display_name === "string"
            ? r.payer_display_name
            : r.payer_phone
              ? String(r.payer_phone)
              : "Customer funding request"
      timeline.push({
        sortAt: String(r.created_at ?? ""),
        kind: "funding_req",
        id: String(r.id),
        title: `User funding · ${String(r.status ?? "")}`,
        subtitle: sender,
        amount: r.amount != null ? Number(r.amount) : null,
        status: r.status != null ? String(r.status) : null,
        transactionRef: r.tx_reference != null ? String(r.tx_reference) : null,
        network: r.mobile_network != null ? String(r.mobile_network) : null,
      })
    }

    timeline.sort((a, b) => (a.sortAt < b.sortAt ? 1 : a.sortAt > b.sortAt ? -1 : 0))

    return NextResponse.json({ timeline, cutoffDays: HISTORY_DAYS })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Internal error" }, { status: 500 })
  }
}
