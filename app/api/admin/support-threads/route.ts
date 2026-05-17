import { NextResponse } from "next/server"
import { getUserFromBearer } from "@/lib/auth-api"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { requireLiquidityAdminLevel5 } from "@/lib/server/security-authz"
import {
  operationalThreadCategoryLabel,
  UNRESOLVED_THREAD_STATUSES,
} from "@/lib/operational-support-institutional"

type ThreadRow = {
  id: string
  user_id: string
  category: string
  status: string
  linked_kind: string | null
  linked_id: string | null
  assigned_admin_id: string | null
  escalated: boolean
  priority: string
  unread_for_admin: boolean
  unread_for_user: boolean
  search_key: string | null
  last_message_at: string
  created_at: string
  updated_at: string
}

/** Level 5: unified operational inbox (all escalations). */
export async function GET(request: Request) {
  try {
    const actor = await getUserFromBearer(request)
    if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    await requireLiquidityAdminLevel5(actor)

    const { searchParams } = new URL(request.url)
    const categoryFilter = searchParams.get("category")?.trim().toLowerCase() || ""
    const unreadOnly = searchParams.get("unread") === "1"
    const unresolvedOnly = searchParams.get("unresolved") === "1"
    const unassignedOnly = searchParams.get("unassigned") === "1"
    const assignedToMe = searchParams.get("assigned") === "me"
    const qRaw = searchParams.get("q")?.trim().toLowerCase() || ""

    const admin = createAdminClient()
    let q = admin
      .from("operational_support_threads")
      .select(
        "id,user_id,category,status,linked_kind,linked_id,assigned_admin_id,escalated,priority,unread_for_admin,unread_for_user,search_key,last_message_at,created_at,updated_at"
      )
      .order("last_message_at", { ascending: false })
      .limit(250)
    if (unreadOnly) q = q.eq("unread_for_admin", true)
    if (unresolvedOnly) q = q.in("status", [...UNRESOLVED_THREAD_STATUSES])
    if (unassignedOnly) q = q.is("assigned_admin_id", null)
    if (assignedToMe) q = q.eq("assigned_admin_id", actor.id)
    if (categoryFilter) q = q.eq("category", categoryFilter)
    if (qRaw) {
      const uuidLike = /^[0-9a-f-]{8,36}$/i.test(qRaw)
      if (uuidLike) {
        q = q.or(`user_id.eq.${qRaw},id.eq.${qRaw},linked_id.eq.${qRaw}`)
      } else {
        q = q.ilike("search_key", `%${qRaw}%`)
      }
    }

    const { data, error } = await q
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    let threads = (data ?? []) as ThreadRow[]

    const userIds = [...new Set(threads.map((t) => t.user_id))]
    const fundIds = threads
      .filter((t) => t.linked_kind === "retailer_fund_request" && t.linked_id)
      .map((t) => t.linked_id as string)
    const withdrawalIds = threads
      .filter((t) => t.linked_kind === "withdrawal_request" && t.linked_id)
      .map((t) => t.linked_id as string)
    const cryptoIds = threads
      .filter((t) => t.linked_kind === "crypto_deposit_request" && t.linked_id)
      .map((t) => t.linked_id as string)

    const [profilesRes, fundRes, wdRes, cryptoRes] = await Promise.all([
      userIds.length
        ? admin.from("profiles").select("id,email,full_name").in("id", userIds)
        : Promise.resolve({ data: [], error: null }),
      fundIds.length
        ? admin
            .from("retailer_fund_requests")
            .select("id,tx_reference,amount,status,fund_channel")
            .in("id", fundIds)
        : Promise.resolve({ data: [], error: null }),
      withdrawalIds.length
        ? admin.from("withdrawal_requests").select("id,status,amount_usd,tx_reference").in("id", withdrawalIds)
        : Promise.resolve({ data: [], error: null }),
      cryptoIds.length
        ? admin.from("crypto_deposit_requests").select("id,tx_hash,status,amount_usd").in("id", cryptoIds)
        : Promise.resolve({ data: [], error: null }),
    ])

    const profMap = new Map(
      (profilesRes.data ?? []).map((p) => [String((p as { id: string }).id), p as Record<string, unknown>]),
    )
    const fundMap = new Map(
      (fundRes.data ?? []).map((r) => [String((r as { id: string }).id), r as Record<string, unknown>]),
    )
    const wdMap = new Map(
      (wdRes.data ?? []).map((r) => [String((r as { id: string }).id), r as Record<string, unknown>]),
    )
    const cryptoMap = new Map(
      (cryptoRes.data ?? []).map((r) => [String((r as { id: string }).id), r as Record<string, unknown>]),
    )

    let enriched = threads.map((t) => {
      const prof = profMap.get(t.user_id)
      let linkedSummary: string | null = null
      if (t.linked_kind === "retailer_fund_request" && t.linked_id) {
        const f = fundMap.get(t.linked_id)
        if (f) {
          linkedSummary = `Funding · ${String(f.tx_reference ?? "").slice(0, 24)} · ${Number(f.amount ?? 0).toFixed(2)} · ${f.status}`
        }
      } else if (t.linked_kind === "withdrawal_request" && t.linked_id) {
        const w = wdMap.get(t.linked_id)
        if (w) {
          linkedSummary = `Withdrawal · ${Number(w.amount_usd ?? 0).toFixed(2)} · ${w.status}`
        }
      } else if (t.linked_kind === "crypto_deposit_request" && t.linked_id) {
        const c = cryptoMap.get(t.linked_id)
        if (c) {
          linkedSummary = `Crypto · ${String(c.tx_hash ?? "").slice(0, 18)} · ${Number(c.amount_usd ?? 0).toFixed(2)} · ${c.status}`
        }
      }
      return {
        ...t,
        category_label: operationalThreadCategoryLabel(t.category),
        user_email: (prof?.email as string | undefined) ?? null,
        user_name: (prof?.full_name as string | undefined) ?? null,
        linked_summary: linkedSummary,
      }
    })

    if (qRaw && !/^[0-9a-f-]{8,36}$/i.test(qRaw)) {
      enriched = enriched.filter((t) => {
        const email = (t.user_email ?? "").toLowerCase()
        const summary = (t.linked_summary ?? "").toLowerCase()
        const key = (t.search_key ?? "").toLowerCase()
        return email.includes(qRaw) || summary.includes(qRaw) || key.includes(qRaw)
      })
    }

    const unreadCount = enriched.filter((t) => t.unread_for_admin).length

    return NextResponse.json({ threads: enriched, unreadCount })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Forbidden"
    return NextResponse.json({ error: msg }, { status: msg.includes("Level 5") ? 403 : 500 })
  }
}
