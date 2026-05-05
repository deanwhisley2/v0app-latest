/**
 * xAI Grok — prefers `POST /v1/responses` (current xAI API); falls back to `/v1/chat/completions`.
 * Set `XAI_API_STYLE=chat` to force legacy only. Default `auto`: try responses, then chat on failure/empty.
 * When XAI_API_KEY is unset: deterministic mock + console.warn (short delay for UX, not 5s).
 */

export type Bias = "BULLISH" | "BEARISH" | "NEUTRAL"
export type NewsSentiment = "POSITIVE" | "NEGATIVE" | "NEUTRAL"

export interface GrokResponse {
  /** True when no API key or parse/API failure fell back to mock */
  mock: boolean
  symbol: string
  xSentiment: {
    hype: number
    fear: number
    bias: Bias
    keyMentions: string[]
  }
  newsSentiment: NewsSentiment
  newsHeadlines: string[]
  narrativeShift: string | null
  keyLevels: { support: number[]; resistance: number[] }
  overallBias: Bias
  confidence: number
  analysisTimeMs: number
}

function parseJsonFromModelContent(content: string): Record<string, unknown> | null {
  const trimmed = content.trim()
  try {
    return JSON.parse(trimmed) as Record<string, unknown>
  } catch {
    const m = trimmed.match(/\{[\s\S]*\}/)
    if (!m) return null
    try {
      return JSON.parse(m[0]) as Record<string, unknown>
    } catch {
      return null
    }
  }
}

function getMockGrokResponse(symbol: string, analysisTimeMs: number): GrokResponse {
  const h = symbol.split("").reduce((a, c) => a + c.charCodeAt(0), 0)
  const hype = 35 + (h % 45)
  const fear = Math.max(5, 100 - hype - (h % 12))
  const bias: Bias =
    hype > fear + 10 ? "BULLISH" : fear > hype + 10 ? "BEARISH" : "NEUTRAL"
  return {
    mock: true,
    symbol,
    xSentiment: {
      hype,
      fear,
      bias,
      keyMentions: ["Mock layer — set XAI_API_KEY for live Grok"],
    },
    newsSentiment: bias === "BULLISH" ? "POSITIVE" : bias === "BEARISH" ? "NEGATIVE" : "NEUTRAL",
    newsHeadlines: [`${symbol}: mock narrative (dev)`],
    narrativeShift: null,
    keyLevels: { support: [], resistance: [] },
    overallBias: bias,
    confidence: 45 + (h % 25),
    analysisTimeMs,
  }
}

/** Extract assistant text from Responses API JSON (`output[].content[]` with type `output_text`). */
function extractResponsesOutputText(data: unknown): string {
  const parts: string[] = []
  const walk = (node: unknown) => {
    if (!node || typeof node !== "object") return
    const o = node as Record<string, unknown>
    if (o.type === "output_text" && typeof o.text === "string") parts.push(o.text)
    for (const v of Object.values(o)) {
      if (Array.isArray(v)) for (const x of v) walk(x)
    }
  }
  walk(data)
  return parts.join("\n").trim()
}

function mapParsedToGrok(symbol: string, parsed: Record<string, unknown>, analysisTimeMs: number): GrokResponse {
  const xs = parsed.xSentiment as Record<string, unknown> | undefined
  const biasRaw = String(xs?.bias ?? "NEUTRAL").toUpperCase()
  const bias: Bias =
    biasRaw === "BULLISH" || biasRaw === "BEARISH" ? (biasRaw as Bias) : "NEUTRAL"
  const newsRaw = String(parsed.newsSentiment ?? "NEUTRAL").toUpperCase()
  const newsSentiment: NewsSentiment =
    newsRaw === "POSITIVE" || newsRaw === "NEGATIVE" ? (newsRaw as NewsSentiment) : "NEUTRAL"
  const obRaw = String(parsed.overallBias ?? "NEUTRAL").toUpperCase()
  const overallBias: Bias =
    obRaw === "BULLISH" || obRaw === "BEARISH" ? (obRaw as Bias) : "NEUTRAL"
  const kl = parsed.keyLevels as Record<string, unknown> | undefined

  return {
    mock: false,
    symbol,
    xSentiment: {
      hype: Math.min(100, Math.max(0, Number(xs?.hype ?? 50))),
      fear: Math.min(100, Math.max(0, Number(xs?.fear ?? 50))),
      bias,
      keyMentions: Array.isArray(xs?.keyMentions)
        ? (xs!.keyMentions as unknown[]).map((x) => String(x))
        : [],
    },
    newsSentiment,
    newsHeadlines: Array.isArray(parsed.newsHeadlines)
      ? (parsed.newsHeadlines as unknown[]).map((x) => String(x))
      : [],
    narrativeShift:
      parsed.narrativeShift === null || parsed.narrativeShift === undefined
        ? null
        : String(parsed.narrativeShift),
    keyLevels: {
      support: Array.isArray(kl?.support) ? (kl!.support as number[]).map(Number) : [],
      resistance: Array.isArray(kl?.resistance) ? (kl!.resistance as number[]).map(Number) : [],
    },
    overallBias,
    confidence: Math.min(100, Math.max(0, Number(parsed.confidence ?? 55))),
    analysisTimeMs,
  }
}

const JSON_INSTRUCTION =
  "You are a crypto analyst. Reply with ONLY valid JSON (no markdown fences) matching: " +
  '{"xSentiment":{"hype":0-100,"fear":0-100,"bias":"BULLISH|BEARISH|NEUTRAL","keyMentions":["string"]},"newsSentiment":"POSITIVE|NEGATIVE|NEUTRAL","newsHeadlines":["string"],"narrativeShift":null,"keyLevels":{"support":[numbers],"resistance":[numbers]},"overallBias":"BULLISH|BEARISH|NEUTRAL","confidence":0-100}'

async function callGrokResponsesApi(
  sym: string,
  apiKey: string,
  model: string,
  signal: AbortSignal
): Promise<string | null> {
  const userPrompt = `Analyze ${sym} (USDT spot context). Short-term retail + X-style sentiment narrative.`
  const res = await fetch("https://api.x.ai/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    signal,
    body: JSON.stringify({
      model,
      store: false,
      instructions: JSON_INSTRUCTION,
      input: userPrompt,
      temperature: 0.3,
      max_output_tokens: 1000,
    }),
  })
  if (!res.ok) {
    const err = await res.text().catch(() => "")
    console.error("[GROK] xAI responses HTTP", res.status, err.slice(0, 400))
    return null
  }
  const data = await res.json()
  const status = (data as { status?: string }).status
  if (status && status !== "completed") {
    console.warn("[GROK] xAI responses status:", status, JSON.stringify(data).slice(0, 300))
  }
  const text = extractResponsesOutputText(data)
  return text || null
}

async function callGrokChatCompletionsApi(
  sym: string,
  apiKey: string,
  model: string,
  signal: AbortSignal
): Promise<string | null> {
  const res = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    signal,
    body: JSON.stringify({
      model,
      temperature: 0.3,
      max_tokens: 1000,
      messages: [
        { role: "system", content: JSON_INSTRUCTION },
        {
          role: "user",
          content: `Analyze ${sym} (USDT spot context). Short-term retail + X-style sentiment narrative.`,
        },
      ],
    }),
  })
  if (!res.ok) {
    const err = await res.text().catch(() => "")
    console.error("[GROK] xAI chat/completions HTTP", res.status, err.slice(0, 400))
    return null
  }
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string | null } }>
  }
  const content = data.choices?.[0]?.message?.content?.trim() ?? ""
  return content || null
}

/**
 * Calls xAI (responses API preferred); enforces wall timeout via AbortController.
 * Resolves to mock on missing key, HTTP error, or invalid JSON (never throws).
 */
export async function callGrok(symbol: string, timeoutMs: number): Promise<GrokResponse> {
  const start = Date.now()
  const sym = symbol.toUpperCase().replace(/[^A-Z0-9]/g, "")
  const apiKey = process.env.XAI_API_KEY?.trim()

  if (!apiKey) {
    console.warn("[GROK] XAI_API_KEY not set — using deterministic mock (set key for live xAI).")
    await new Promise((r) => setTimeout(r, Math.min(450, Math.max(0, timeoutMs))))
    return getMockGrokResponse(sym, Date.now() - start)
  }

  const style = (process.env.XAI_API_STYLE?.trim().toLowerCase() || "auto") as "auto" | "responses" | "chat"
  const model = process.env.XAI_MODEL?.trim() || "grok-4.3"
  const wallMs = Math.max(1500, timeoutMs)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), wallMs)

  try {
    let raw: string | null = null

    if (style === "chat") {
      raw = await callGrokChatCompletionsApi(sym, apiKey, model, controller.signal)
    } else if (style === "responses") {
      raw = await callGrokResponsesApi(sym, apiKey, model, controller.signal)
    } else {
      raw = await callGrokResponsesApi(sym, apiKey, model, controller.signal)
      if (!raw) {
        console.warn("[GROK] responses API empty or failed — trying chat/completions")
        raw = await callGrokChatCompletionsApi(sym, apiKey, model, controller.signal)
      }
    }

    clearTimeout(timer)

    if (!raw) {
      return getMockGrokResponse(sym, Date.now() - start)
    }

    const parsed = parseJsonFromModelContent(raw)
    if (!parsed) {
      console.error("[GROK] JSON parse failed:", raw.slice(0, 200))
      return getMockGrokResponse(sym, Date.now() - start)
    }

    return mapParsedToGrok(sym, parsed, Date.now() - start)
  } catch (e) {
    clearTimeout(timer)
    if ((e as Error)?.name === "AbortError") {
      return getMockGrokResponse(sym, Date.now() - start)
    }
    console.error("[GROK] API call failed:", e)
    return getMockGrokResponse(sym, Date.now() - start)
  }
}
