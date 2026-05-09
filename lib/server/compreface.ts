type VerifyResult = {
  matched: boolean
  score: number
  threshold: number
}

function baseUrl(): string {
  return (process.env.COMPRE_FACE_API_URL || "").trim().replace(/\/$/, "")
}

function apiKey(): string {
  return (process.env.COMPRE_FACE_API_KEY || "").trim()
}

export function isCompreFaceConfigured(): boolean {
  return Boolean(baseUrl() && apiKey())
}

function decodeDataUrlToBlob(dataUrl: string): Blob {
  const m = dataUrl.match(/^data:(.+?);base64,(.+)$/)
  if (!m) throw new Error("Invalid image data URL")
  const mime = m[1] || "image/jpeg"
  const b64 = m[2]
  const buf = Buffer.from(b64, "base64")
  return new Blob([buf], { type: mime })
}

export async function comprefaceVerifyFace(
  sourceImageDataUrl: string,
  targetImageDataUrl: string
): Promise<VerifyResult> {
  if (!isCompreFaceConfigured()) {
    throw new Error("CompreFace is not configured")
  }
  const form = new FormData()
  form.append("source_image", decodeDataUrlToBlob(sourceImageDataUrl), "source.jpg")
  form.append("target_image", decodeDataUrlToBlob(targetImageDataUrl), "target.jpg")
  const threshold = Number(process.env.COMPRE_FACE_VERIFY_THRESHOLD || "0.82")
  form.append("det_prob_threshold", "0.8")
  form.append("prediction_count", "1")

  const res = await fetch(`${baseUrl()}/api/v1/verification/verify`, {
    method: "POST",
    headers: { "x-api-key": apiKey() },
    body: form,
    signal: AbortSignal.timeout(20_000),
  })
  const body = (await res.json().catch(() => ({}))) as {
    result?: Array<{ similarity?: number }>
    message?: string
    error?: string
  }
  if (!res.ok) {
    throw new Error(body.message || body.error || `CompreFace verify failed (${res.status})`)
  }

  const score = Number(body.result?.[0]?.similarity || 0)
  return { matched: score >= threshold, score, threshold }
}

export async function comprefaceEnrollFace(
  subject: string,
  imageDataUrl: string
): Promise<void> {
  if (!isCompreFaceConfigured()) return
  const form = new FormData()
  form.append("subject", subject)
  form.append("image", decodeDataUrlToBlob(imageDataUrl), "enroll.jpg")

  const res = await fetch(`${baseUrl()}/api/v1/recognition/faces`, {
    method: "POST",
    headers: { "x-api-key": apiKey() },
    body: form,
    signal: AbortSignal.timeout(20_000),
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string; error?: string }
    throw new Error(body.message || body.error || `CompreFace enroll failed (${res.status})`)
  }
}

export async function comprefaceRecognizeSubject(
  imageDataUrl: string,
  expectedSubject: string
): Promise<VerifyResult> {
  if (!isCompreFaceConfigured()) {
    throw new Error("CompreFace is not configured")
  }
  const form = new FormData()
  form.append("file", decodeDataUrlToBlob(imageDataUrl), "probe.jpg")
  form.append("det_prob_threshold", "0.8")
  form.append("prediction_count", "5")

  const res = await fetch(`${baseUrl()}/api/v1/recognition/recognize`, {
    method: "POST",
    headers: { "x-api-key": apiKey() },
    body: form,
    signal: AbortSignal.timeout(20_000),
  })
  const body = (await res.json().catch(() => ({}))) as {
    result?: Array<{ subjects?: Array<{ subject?: string; similarity?: number }> }>
    message?: string
    error?: string
  }
  if (!res.ok) {
    throw new Error(body.message || body.error || `CompreFace recognize failed (${res.status})`)
  }
  const threshold = Number(process.env.COMPRE_FACE_VERIFY_THRESHOLD || "0.82")
  const subjects = body.result?.[0]?.subjects ?? []
  const hit = subjects.find((s) => String(s.subject || "") === expectedSubject)
  const score = Number(hit?.similarity || 0)
  return { matched: score >= threshold, score, threshold }
}
