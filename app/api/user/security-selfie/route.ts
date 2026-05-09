import { NextResponse } from "next/server"
import { getUserFromBearer } from "@/lib/auth-api"
import { createAdminClient } from "@/lib/supabaseAdmin"
import { mergeSafeUserMetadata } from "@/lib/server/auth-jwt-metadata"
import { compareFaceTemplateV1 } from "@/lib/server/face-template"
import { comprefaceEnrollFace, isCompreFaceConfigured } from "@/lib/server/compreface"

export async function GET(request: Request) {
  try {
    const user = await getUserFromBearer(request)
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const admin = createAdminClient()
    const hasTemplate = typeof user.user_metadata?.selfie_template_v1 === "string"
    const hasHash = typeof user.user_metadata?.selfie_hash === "string"
    const hasFlag = Boolean(user.user_metadata?.security_selfie_enrolled)
    return NextResponse.json({
      ok: true,
      hasSelfie: hasTemplate || hasHash || hasFlag,
      selfieMode: "template_v1",
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Internal error" },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const user = await getUserFromBearer(request)
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    const selfieImage = typeof body.selfie_image === "string" ? body.selfie_image.trim() : ""
    const selfieTemplate =
      typeof body.selfie_template === "string" ? body.selfie_template.trim() : ""
    const selfieHash =
      typeof body.selfie_hash === "string" ? body.selfie_hash.trim().toLowerCase() : ""
    if (!selfieTemplate || !/^[A-Za-z0-9_-]{120,600}$/.test(selfieTemplate)) {
      return NextResponse.json({ error: "selfie_template is required" }, { status: 400 })
    }
    if (!selfieHash || !/^[0-9a-f]{16,}$/.test(selfieHash)) {
      return NextResponse.json({ error: "selfie_hash is required" }, { status: 400 })
    }
    if (selfieImage && selfieImage.length > 6_000_000) {
      return NextResponse.json({ error: "Selfie payload too large" }, { status: 413 })
    }

    const admin = createAdminClient()
    const nowIso = new Date().toISOString()
    // Legacy cleanup: drop any persisted selfie image from profile storage.
    await admin.from("profiles").update({ avatar_url: null, updated_at: nowIso }).eq("id", user.id)

    const currentMeta = (user.user_metadata ?? {}) as Record<string, unknown>
    const { error: metaError } = await admin.auth.admin.updateUserById(user.id, {
      user_metadata: mergeSafeUserMetadata(currentMeta, {
        selfie_hash: selfieHash,
        selfie_template_v1: selfieTemplate,
        selfie_template_version: "v1",
        selfie_enrolled_at: nowIso,
        security_selfie_enrolled: true,
      }),
    })
    if (metaError) return NextResponse.json({ error: metaError.message }, { status: 500 })

    if (isCompreFaceConfigured() && selfieImage) {
      try {
        await comprefaceEnrollFace(user.id, selfieImage)
      } catch (e) {
        console.warn("[security-selfie] CompreFace enroll warning:", e instanceof Error ? e.message : String(e))
      }
    }

    return NextResponse.json({
      ok: true,
      faceAdded: true,
      message: "Face added. Selfie fingerprint encoded for secure comparison.",
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Internal error" },
      { status: 500 }
    )
  }
}

function hammingDistanceHex(a: string, b: string): number {
  const len = Math.min(a.length, b.length)
  let dist = Math.abs(a.length - b.length) * 4
  for (let i = 0; i < len; i += 1) {
    const x = Number.parseInt(a[i], 16) ^ Number.parseInt(b[i], 16)
    dist += x.toString(2).split("1").length - 1
  }
  return dist
}

export async function PUT(request: Request) {
  try {
    const user = await getUserFromBearer(request)
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    const selfieTemplate =
      typeof body.selfie_template === "string" ? body.selfie_template.trim() : ""
    const selfieHash = typeof body.selfie_hash === "string" ? body.selfie_hash.trim().toLowerCase() : ""
    if (!selfieTemplate && !selfieHash) {
      return NextResponse.json({ error: "selfie_template or selfie_hash is required" }, { status: 400 })
    }

    const storedTemplate =
      typeof user.user_metadata?.selfie_template_v1 === "string"
        ? String(user.user_metadata.selfie_template_v1)
        : ""
    const storedHash =
      typeof user.user_metadata?.selfie_hash === "string"
        ? String(user.user_metadata.selfie_hash).toLowerCase()
        : ""
    if (!storedTemplate && !storedHash) {
      return NextResponse.json({ error: "No enrolled selfie to compare against." }, { status: 409 })
    }

    if (storedTemplate && selfieTemplate) {
      const compared = compareFaceTemplateV1(storedTemplate, selfieTemplate)
      return NextResponse.json({ ok: true, matched: compared.matched, score: compared.score, threshold: compared.threshold })
    }

    if (!storedHash || !selfieHash) {
      return NextResponse.json({ error: "Biometric template mismatch. Re-enroll selfie." }, { status: 409 })
    }
    const distance = hammingDistanceHex(storedHash, selfieHash)
    const matched = distance <= 14
    return NextResponse.json({ ok: true, matched, distance, threshold: 14 })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Internal error" },
      { status: 500 }
    )
  }
}
