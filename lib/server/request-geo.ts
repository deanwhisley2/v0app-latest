import { isDevLocalOnly } from "@/lib/dev-local-mode"

const GEO_CACHE_MS = 60 * 60 * 1000
const geoCache = new Map<string, { countryCode: string; at: number }>()

export function getRequestIpAddress(request: Request): string | null {
  const cf = request.headers.get("cf-connecting-ip")?.trim()
  if (cf) return cf
  const xff = request.headers.get("x-forwarded-for")
  if (xff) return xff.split(",")[0]?.trim() ?? null
  return request.headers.get("x-real-ip")?.trim() ?? null
}

/** Cloudflare / edge country hint — preferred over third-party IP APIs when present. */
export function getEdgeCountryCode(request: Request): string | null {
  const raw =
    request.headers.get("cf-ipcountry")?.trim() ??
    request.headers.get("x-vercel-ip-country")?.trim() ??
    request.headers.get("cloudfront-viewer-country")?.trim() ??
    ""
  const cc = raw.toUpperCase().slice(0, 2)
  if (cc.length !== 2 || cc === "XX" || cc === "T1") return null
  return cc
}

function isPrivateOrLocalIp(ip: string): boolean {
  const n = ip.toLowerCase()
  if (n === "::1" || n.startsWith("::ffff:127.") || n === "127.0.0.1") return true
  if (n.startsWith("10.") || n.startsWith("192.168.") || n.startsWith("172.16.")) return true
  return false
}

export function shouldBypassCountryCorridor(ip: string | null): boolean {
  if (isDevLocalOnly()) return true
  if (process.env.NEXUS_BYPASS_COUNTRY_CORRIDOR === "1") return true
  if (!ip || isPrivateOrLocalIp(ip)) return true
  return false
}

/** Resolve public IP → ISO 3166-1 alpha-2 (best effort). Returns null if unknown. */
export async function resolveIpToCountryCode(ip: string): Promise<string | null> {
  const trimmed = ip.trim()
  if (!trimmed || isPrivateOrLocalIp(trimmed)) return null

  const cached = geoCache.get(trimmed)
  if (cached && Date.now() - cached.at < GEO_CACHE_MS) return cached.countryCode

  try {
    const url = `http://ip-api.com/json/${encodeURIComponent(trimmed)}?fields=status,countryCode`
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) })
    if (!res.ok) return null
    const data = (await res.json()) as { status?: string; countryCode?: string }
    if (data.status !== "success" || !data.countryCode) return null
    const cc = data.countryCode.trim().toUpperCase().slice(0, 2)
    if (cc.length !== 2) return null
    geoCache.set(trimmed, { countryCode: cc, at: Date.now() })
    return cc
  } catch {
    return null
  }
}

export async function detectCountryFromRequest(request: Request): Promise<string | null> {
  const edge = getEdgeCountryCode(request)
  if (edge) return edge

  const ip = getRequestIpAddress(request)
  if (!ip || shouldBypassCountryCorridor(ip)) return null
  return resolveIpToCountryCode(ip)
}
