/**
 * Smoke-test xAI Responses API using .env.local (not committed).
 * Usage: npx tsx scripts/test-xai-grok.ts
 */
import { config } from "dotenv"
import { resolve } from "node:path"

config({ path: resolve(process.cwd(), ".env.local") })

const apiKey = process.env.XAI_API_KEY?.trim()
const model = process.env.XAI_MODEL?.trim() || "grok-4.3"

async function main() {
  if (!apiKey) {
    console.error("Missing XAI_API_KEY in .env.local")
    process.exit(1)
  }

  const body = {
    model,
    store: false,
    instructions: "Reply in at most one short sentence.",
    input: "Reply with exactly: pong",
    max_output_tokens: 64,
  }

  const res = await fetch("https://api.x.ai/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  })

  const text = await res.text()
  console.log("HTTP", res.status)
  try {
    const j = JSON.parse(text) as { status?: string; error?: unknown; output?: unknown }
    console.log("response.status field:", j.status)
    if (j.error) console.log("error:", JSON.stringify(j.error))
    console.log("raw (truncated):", text.slice(0, 1200))
  } catch {
    console.log(text.slice(0, 800))
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
