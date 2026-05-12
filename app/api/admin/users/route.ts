import { randomBytes } from "node:crypto"
import { NextResponse } from "next/server"
import { getUserFromBearer } from "@/lib/auth-api"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { requireLiquidityAdminLevel5 } from "@/lib/server/security-authz"
import { getPublicSiteOrigin } from "@/lib/site-public-url"

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s)
}

export async function GET(request: Request) {
  try {
    const actor = await getUserFromBearer(request)
    if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    await requireLiquidityAdminLevel5(actor)

    const { searchParams } = new URL(request.url)
    const qRaw = (searchParams.get("q") ?? "").trim()
    const admin = createAdminClient()

    if (qRaw && isUuid(qRaw)) {
      const { data: u, error } = await admin.auth.admin.getUserById(qRaw)
      if (error || !u.user) return NextResponse.json({ users: [] })
      const { data: prof } = await admin
        .from("profiles")
        .select(
          "id, trading_user_level, operational_freeze_at, account_disabled_at, referral_code, funding_country_code"
        )
        .eq("id", u.user.id)
        .maybeSingle()
      return NextResponse.json({
        users: [
          {
            id: u.user.id,
            email: u.user.email ?? "",
            created_at: u.user.created_at,
            profile: prof ?? null,
          },
        ],
      })
    }

    if (!qRaw || qRaw.length < 2) {
      return NextResponse.json({
        users: [],
        hint: "Provide q= with at least 2 characters (email substring) or a user UUID.",
      })
    }

    const qLower = qRaw.toLowerCase()
    const accum: Array<{
      id: string
      email: string
      created_at: string | undefined
      profile: Record<string, unknown> | null
    }> = []

    for (let page = 1; page <= 5 && accum.length < 40; page++) {
      const { data: batch, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      const users = batch?.users ?? []
      if (users.length === 0) break
      for (const u of users) {
        const em = (u.email ?? "").toLowerCase()
        if (!em.includes(qLower)) continue
        const { data: prof } = await admin
          .from("profiles")
          .select(
            "id, trading_user_level, operational_freeze_at, account_disabled_at, referral_code, funding_country_code"
          )
          .eq("id", u.id)
          .maybeSingle()
        accum.push({
          id: u.id,
          email: u.email ?? "",
          created_at: u.created_at,
          profile: prof as Record<string, unknown> | null,
        })
        if (accum.length >= 40) break
      }
    }

    return NextResponse.json({ users: accum })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Forbidden" }, { status: 403 })
  }
}

export async function PATCH(request: Request) {
  try {
    const actor = await getUserFromBearer(request)
    if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    await requireLiquidityAdminLevel5(actor)

    const body = (await request.json().catch(() => ({}))) as {
      userId?: string
      action?:
        | "freeze"
        | "unfreeze"
        | "disable"
        | "enable"
        | "recovery_link"
        | "reset_password"
        | "burn_balances"
        | "delete_user"
        | "set_level"
      tradingUserLevel?: number
    }
    const userId = typeof body.userId === "string" ? body.userId.trim() : ""
    if (!userId || !body.action) {
      return NextResponse.json({ error: "userId and action are required." }, { status: 400 })
    }

    const admin = createAdminClient()
    const now = new Date().toISOString()

    if (userId === actor.id && (body.action === "delete_user" || body.action === "disable")) {
      return NextResponse.json({ error: "You cannot perform this action on your own account." }, { status: 400 })
    }

    if (body.action === "reset_password") {
      const raw = randomBytes(18).toString("base64url").replace(/[^a-zA-Z0-9]/g, "")
      const temporaryPassword = `${raw.slice(0, 12)}Aa1`
      const { error } = await admin.auth.admin.updateUserById(userId, {
        password: temporaryPassword,
      })
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
      return NextResponse.json({
        ok: true,
        temporaryPassword,
        message:
          "Password set by admin. Share once via a verified channel; user should sign in and change password under account settings.",
      })
    }

    if (body.action === "burn_balances") {
      const { data: exists } = await admin.from("user_balances").select("user_id").eq("user_id", userId).maybeSingle()
      if (!exists) return NextResponse.json({ ok: true, message: "No user_balances row — nothing to burn." })
      const { error } = await admin
        .from("user_balances")
        .update({
          available_balance: 0,
          retail_balance: 0,
          withdrawal_pending_balance: 0,
          current_stake: 0,
          last_updated: now,
        })
        .eq("user_id", userId)
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
      return NextResponse.json({ ok: true, message: "Nexus Main, Retail, and pending withdrawal buckets zeroed." })
    }

    if (body.action === "delete_user") {
      const { error } = await admin.auth.admin.deleteUser(userId)
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
      return NextResponse.json({ ok: true, message: "Auth user deleted (profile cascade depends on DB policies)." })
    }

    if (body.action === "set_level") {
      const lvl = Number(body.tradingUserLevel)
      if (![1, 2, 5].includes(lvl)) {
        return NextResponse.json({ error: "tradingUserLevel must be 1, 2, or 5." }, { status: 400 })
      }
      const { error } = await admin
        .from("profiles")
        .update({ trading_user_level: lvl, updated_at: now })
        .eq("id", userId)
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
      return NextResponse.json({ ok: true, trading_user_level: lvl })
    }

    if (body.action === "recovery_link") {
      const { data: u, error } = await admin.auth.admin.getUserById(userId)
      if (error || !u.user?.email) {
        return NextResponse.json({ error: "User not found or missing email." }, { status: 404 })
      }
      const siteBase = getPublicSiteOrigin(request.url)
      const redirectTo = `${siteBase}/auth/reset-password`
      const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
        type: "recovery",
        email: u.user.email,
        options: { redirectTo },
      })
      if (linkError || !linkData?.properties?.action_link) {
        return NextResponse.json({ error: linkError?.message ?? "Could not generate recovery link." }, { status: 500 })
      }
      return NextResponse.json({
        ok: true,
        email: u.user.email,
        /** Deliver through a secure channel; never log in client analytics. */
        recoveryActionLink: linkData.properties.action_link,
      })
    }

    const patch: Record<string, unknown> = { updated_at: now }
    if (body.action === "freeze") patch.operational_freeze_at = now
    if (body.action === "unfreeze") patch.operational_freeze_at = null
    if (body.action === "disable") patch.account_disabled_at = now
    if (body.action === "enable") patch.account_disabled_at = null

    if (!("operational_freeze_at" in patch) && !("account_disabled_at" in patch)) {
      return NextResponse.json({ error: "Unsupported action for profile update." }, { status: 400 })
    }

    const { error: up } = await admin.from("profiles").update(patch).eq("id", userId)
    if (up) return NextResponse.json({ error: up.message }, { status: 400 })

    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Forbidden" }, { status: 403 })
  }
}
