import { NextResponse } from "next/server"
import { getUserFromBearer } from "@/lib/auth-api"
import { requireLiquidityAdminLevel5 } from "@/lib/server/security-authz"
import { createAdminClient } from "@/lib/supabaseAdmin"
import {
  getPlatformLaunchStatus,
  invalidatePlatformLaunchCache,
  loadLaunchWindow,
} from "@/lib/server/platform-launch"
import { GLOBAL_LAUNCH_SLUG } from "@/lib/platform-launch-config"

/** Level 5: read/update Uganda launch window configuration. */
export async function GET(request: Request) {
  try {
    const actor = await getUserFromBearer(request)
    if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    await requireLiquidityAdminLevel5(actor)

    const admin = createAdminClient()
    const row = await loadLaunchWindow(admin)
    const status = await getPlatformLaunchStatus(true)

    return NextResponse.json({
      ok: true,
      window: row,
      status,
      programs: status.programs,
    })
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Internal error" },
      { status: 500 },
    )
  }
}

export async function PATCH(request: Request) {
  try {
    const actor = await getUserFromBearer(request)
    if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    await requireLiquidityAdminLevel5(actor)

    const body = (await request.json()) as {
      slug?: string
      status?: "active" | "paused" | "expired"
      programs?: Record<string, unknown>
      extendDays?: number
    }

    const slug = body.slug?.trim() || GLOBAL_LAUNCH_SLUG
    const admin = createAdminClient()
    const row = await loadLaunchWindow(admin, slug)
    if (!row) {
      return NextResponse.json({ ok: false, error: "Launch window not found" }, { status: 404 })
    }

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (body.programs && typeof body.programs === "object") {
      patch.programs = { ...row.programs, ...body.programs }
    }
    if (body.status === "paused" || body.status === "expired" || body.status === "active") {
      patch.status = body.status
      if (body.status === "active" && !row.activated_at) {
        const now = new Date()
        patch.activated_at = now.toISOString()
        patch.ends_at = new Date(now.getTime() + row.duration_days * 24 * 60 * 60 * 1000).toISOString()
      }
    }
    if (typeof body.extendDays === "number" && body.extendDays > 0 && body.extendDays <= 30) {
      const base = row.ends_at ? new Date(row.ends_at) : new Date()
      patch.ends_at = new Date(base.getTime() + body.extendDays * 24 * 60 * 60 * 1000).toISOString()
      patch.status = "active"
    }

    const { error } = await admin.from("platform_launch_windows").update(patch).eq("slug", slug)
    if (error) throw new Error(error.message)

    invalidatePlatformLaunchCache()
    const status = await getPlatformLaunchStatus(true)
    return NextResponse.json({ ok: true, status })
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Internal error" },
      { status: 500 },
    )
  }
}
