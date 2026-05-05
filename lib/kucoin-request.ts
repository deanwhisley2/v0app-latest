/**
 * KuCoin Classic REST signing (read-only helpers for server routes).
 * @see https://www.kucoin.com/docs/beginners/authentication
 *
 * API key **v2**: `KC-API-KEY-VERSION: 2` and `KC-API-PASSPHRASE` = Base64(HMAC-SHA256(secret, passphrase)).
 * API key **v1**: omit version header; passphrase sent plain in `KC-API-PASSPHRASE`.
 */

import crypto from "node:crypto"

export const KUCOIN_API_BASE = "https://api.kucoin.com"

export function kucoinSignRequest(
  secret: string,
  timestamp: string,
  method: string,
  pathWithQuery: string,
  bodyStr: string
): string {
  const pre = timestamp + method.toUpperCase() + pathWithQuery + bodyStr
  return crypto.createHmac("sha256", secret).update(pre).digest("base64")
}

/** v2 API key: encrypted passphrase header value */
export function kucoinPassphraseHeaderV2(secret: string, passphrase: string): string {
  return crypto.createHmac("sha256", secret).update(passphrase).digest("base64")
}

export type KucoinPrivateGetOptions = {
  pathWithQuery: string
  apiKey: string
  apiSecret: string
  passphrase: string
  /** Default `2` (current KuCoin keys). Set `1` for legacy keys. */
  keyVersion?: "1" | "2"
  signal?: AbortSignal
}

export async function kucoinPrivateGet(opts: KucoinPrivateGetOptions): Promise<Response> {
  const { pathWithQuery, apiKey, apiSecret, passphrase, keyVersion = "2", signal } = opts
  const timestamp = Date.now().toString()
  const sign = kucoinSignRequest(apiSecret, timestamp, "GET", pathWithQuery, "")

  const headers: Record<string, string> = {
    "KC-API-KEY": apiKey,
    "KC-API-SIGN": sign,
    "KC-API-TIMESTAMP": timestamp,
  }

  if (keyVersion === "2") {
    headers["KC-API-KEY-VERSION"] = "2"
    headers["KC-API-PASSPHRASE"] = kucoinPassphraseHeaderV2(apiSecret, passphrase)
  } else {
    headers["KC-API-PASSPHRASE"] = passphrase
  }

  const url = `${KUCOIN_API_BASE}${pathWithQuery}`
  return fetch(url, {
    method: "GET",
    headers: { Accept: "application/json", ...headers },
    signal: signal ?? AbortSignal.timeout(15000),
  })
}
