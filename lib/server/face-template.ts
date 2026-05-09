const TEMPLATE_BYTES = 16 * 16

function fromBase64Url(input: string): Uint8Array {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/")
  const padLen = normalized.length % 4 === 0 ? 0 : 4 - (normalized.length % 4)
  const padded = normalized + "=".repeat(padLen)
  const buf = Buffer.from(padded, "base64")
  return new Uint8Array(buf)
}

export function parseFaceTemplateV1(input: string): Uint8Array {
  const raw = (input || "").trim()
  if (!/^[A-Za-z0-9_-]{120,600}$/.test(raw)) {
    throw new Error("Invalid selfie_template format")
  }
  const bytes = fromBase64Url(raw)
  if (bytes.length !== TEMPLATE_BYTES) {
    throw new Error("Invalid selfie_template length")
  }
  return bytes
}

function cosineSimilarity(a: Uint8Array, b: Uint8Array): number {
  let dot = 0
  let a2 = 0
  let b2 = 0
  for (let i = 0; i < a.length; i += 1) {
    const av = (a[i] - 127.5) / 127.5
    const bv = (b[i] - 127.5) / 127.5
    dot += av * bv
    a2 += av * av
    b2 += bv * bv
  }
  if (!a2 || !b2) return 0
  return dot / Math.sqrt(a2 * b2)
}

export function compareFaceTemplateV1(
  enrolledTemplate: string,
  probeTemplate: string,
  threshold = 0.92
): { matched: boolean; score: number; threshold: number } {
  const enrolled = parseFaceTemplateV1(enrolledTemplate)
  const probe = parseFaceTemplateV1(probeTemplate)
  const score = cosineSimilarity(enrolled, probe)
  return { matched: score >= threshold, score, threshold }
}
