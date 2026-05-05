/**
 * Bitget REST signing (V2) — read-only helpers for server routes.
 * @see https://www.bitget.com/api-doc/common/signature
 */

const BITGET_API_BASE = "https://api.bitget.com"

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = ""
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]!)
  return btoa(binary)
}

/** Build pre-sign string: timestamp + METHOD + requestPath + ("?" + queryString if any) + (body if any). */
export function buildBitgetSignMessage(
  timestamp: string,
  method: string,
  requestPath: string,
  queryString: string,
  bodyStr: string
): string {
  const m = method.toUpperCase()
  let msg = timestamp + m + requestPath
  if (queryString) msg += `?${queryString}`
  if (bodyStr) msg += bodyStr
  return msg
}

export async function signBitgetHmacBase64(message: string, secretKey: string): Promise<string> {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secretKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  )
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message))
  return uint8ToBase64(new Uint8Array(signature))
}

export type BitgetRequestOptions = {
  method: "GET" | "POST"
  /** Path only, e.g. /api/v2/spot/account/assets */
  requestPath: string
  /** Query string without leading ?, e.g. limit=20&symbol=BTCUSDT */
  queryString?: string
  /** JSON body object (POST only); stringified for signing. */
  body?: Record<string, unknown>
  apiKey: string
  apiSecret: string
  apiPassphrase: string
  signal?: AbortSignal
}

/**
 * Authenticated Bitget REST call. Headers match official REST requirements.
 */
export async function bitgetPrivateRequest<T = unknown>(opts: BitgetRequestOptions): Promise<T> {
  const { method, requestPath, queryString = "", body, apiKey, apiSecret, apiPassphrase, signal } = opts
  const timestamp = Date.now().toString()
  const bodyStr = method === "POST" && body ? JSON.stringify(body) : ""
  const message = buildBitgetSignMessage(timestamp, method, requestPath, queryString, bodyStr)
  const signature = await signBitgetHmacBase64(message, apiSecret)

  const headers: Record<string, string> = {
    "ACCESS-KEY": apiKey,
    "ACCESS-SIGN": signature,
    "ACCESS-TIMESTAMP": timestamp,
    "ACCESS-PASSPHRASE": apiPassphrase,
    locale: "en-US",
  }
  if (method === "POST" && bodyStr) {
    headers["Content-Type"] = "application/json"
  }

  const qs = queryString ? `?${queryString}` : ""
  const url = `${BITGET_API_BASE}${requestPath}${qs}`

  const response = await fetch(url, {
    method,
    headers,
    body: method === "POST" && bodyStr ? bodyStr : undefined,
    signal: signal ?? AbortSignal.timeout(15000),
  })

  const data = (await response.json()) as T
  return data
}

export { BITGET_API_BASE }
