import { NextResponse } from "next/server"
import { bearerUserWithGovernance } from "@/lib/server/account-governance"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { bridgeUserOperationalEscalation } from "@/lib/server/operational-support-bridge"
import {
  assertNotInCooldown,
  getOrCreateSecurityProfile,
  hasSavedWithdrawalNumber,
  maskChangeRequestValue,
} from "@/lib/server/user-security-profile-service"
import { notifyLiquidityAdminsSupportQueue } from "@/lib/support-thread-notifications"

/** Appeals only for changing an existing withdrawal number or security PIN. */
const ALLOWED_TYPES = ["withdrawal_number", "security_code"] as const

export async function GET(request: Request) {
  try {
    const auth = await bearerUserWithGovernance(request, "read")
    if ("response" in auth) return auth.response
    const admin = createAdminClient()
    const { data, error } = await admin
      .from("security_change_requests")
      .select("id,request_type,old_value_masked,new_value_masked,status,thread_id,created_at,updated_at,resolved_at")
      .eq("user_id", auth.user.id)
      .order("created_at", { ascending: false })
      .limit(50)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ requests: data ?? [] })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Internal error" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const auth = await bearerUserWithGovernance(request, "mutate")
    if ("response" in auth) return auth.response
    const body = (await request.json().catch(() => ({}))) as {
      request_type?: string
      new_value?: string
      message?: string
    }
    const requestType = typeof body.request_type === "string" ? body.request_type.trim() : ""
    const newValue = typeof body.new_value === "string" ? body.new_value.trim() : ""
    const message = typeof body.message === "string" ? body.message.trim() : ""
    if (!(ALLOWED_TYPES as readonly string[]).includes(requestType)) {
      return NextResponse.json({ error: "Invalid request_type." }, { status: 400 })
    }
    if (!newValue || !message) {
      return NextResponse.json({ error: "new_value and message are required." }, { status: 400 })
    }

    const admin = createAdminClient()
    const row = await getOrCreateSecurityProfile(admin, auth.user.id)
    if (!row.security_code_hash) {
      return NextResponse.json({ error: "Complete Nexus Security setup before submitting appeals." }, { status: 403 })
    }
    try {
      assertNotInCooldown(row)
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : "Cooldown active." }, { status: 409 })
    }

    if (requestType === "withdrawal_number" && !hasSavedWithdrawalNumber(row)) {
      return NextResponse.json(
        { error: "Register your first withdrawal number in Settings — appeals are only for changing an existing number." },
        { status: 400 },
      )
    }
    if (requestType === "security_code" && !row.security_code_hash) {
      return NextResponse.json(
        { error: "Set your Security PIN in Settings first — appeals are only for changing an existing PIN." },
        { status: 400 },
      )
    }

    const oldMasked =
      requestType === "deposit_number"
        ? maskChangeRequestValue(requestType, row.deposit_number ?? "")
        : requestType === "withdrawal_number"
          ? maskChangeRequestValue(requestType, row.withdrawal_number ?? "")
          : requestType === "crypto_wallet"
            ? maskChangeRequestValue(requestType, row.crypto_wallet ?? "")
            : requestType === "security_code"
              ? "******"
              : row.payout_method ?? ""

    const newMasked = maskChangeRequestValue(requestType, newValue)

    const { data: openReq } = await admin
      .from("security_change_requests")
      .select("id")
      .eq("user_id", auth.user.id)
      .eq("request_type", requestType)
      .in("status", ["open", "verifying", "pending_code_confirmation"])
      .limit(1)
    if (openReq?.length) {
      return NextResponse.json({ error: "You already have an open appeal for this detail." }, { status: 409 })
    }

    const appealBody = [
      `SECURITY UPDATE APPEAL`,
      `Type: ${requestType}`,
      `Requested change: ${newMasked}`,
      "",
      message,
    ].join("\n")

    const { threadId } = await bridgeUserOperationalEscalation(admin, {
      userId: auth.user.id,
      body: appealBody,
      category: "security_update",
      linkedKind: null,
      linkedId: null,
      source: "user",
      escalationSource: "user_desk",
      priority: "high",
    })

    const now = new Date().toISOString()
    const { data: reqRow, error: insErr } = await admin
      .from("security_change_requests")
      .insert({
        user_id: auth.user.id,
        request_type: requestType,
        old_value_masked: oldMasked,
        new_value_masked: newMasked,
        status: "open",
        thread_id: threadId,
      })
      .select("id")
      .single()
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })

    if (reqRow?.id) {
      await admin
        .from("operational_support_threads")
        .update({
          linked_kind: "security_change_request",
          linked_id: reqRow.id,
          category: "security_update",
          priority: "high",
          updated_at: now,
        })
        .eq("id", threadId)
    }

    try {
      await notifyLiquidityAdminsSupportQueue(admin, {
        threadId,
        title: "Security change appeal",
        body: `${requestType}: ${newMasked}`,
      })
    } catch {
      /* non-fatal */
    }

    return NextResponse.json({ ok: true, threadId, requestId: reqRow?.id })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Internal error" }, { status: 500 })
  }
}
