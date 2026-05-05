import { NextResponse } from "next/server"
import { z } from "zod"
import { runNexusAssistant } from "@/lib/nexus-assistant/model"
import type { NexusAssistantSurface } from "@/lib/nexus-assistant/types"
import { buildJoelinDeepseekSystemPrompt } from "@/lib/nexus-assistant/deepseek-prompt"

const surfaces: [NexusAssistantSurface, ...NexusAssistantSurface[]] = [
  "auth_screen",
  "settings_learner",
  "floating_login",
  "floating_dashboard",
  "dashboard_wallstreet_assistant",
  "bottom_nav_mini",
]

const bodySchema = z.object({
  userMessage: z.string().max(6000),
  surface: z.enum(surfaces),
  tradingUserLevel: z.number().int().min(1).max(99).default(1),
  isGuest: z.boolean().default(false),
  authStep: z.string().max(64).optional(),
  focusSymbol: z.string().max(32).optional(),
  precomputedDraft: z.string().max(12000).optional(),
})

async function generateWithDeepSeek(systemPrompt: string, userMessage: string): Promise<string | null> {
  const key = process.env.DEEPSEEK_API_KEY?.trim()
  if (!key) return null

  const base = (process.env.DEEPSEEK_API_BASE_URL || "https://api.deepseek.com/v1").replace(/\/$/, "")
  const model = process.env.DEEPSEEK_MODEL?.trim() || "deepseek-chat"

  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      temperature: 0.45,
      max_tokens: 1400,
    }),
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => "")
    console.error("[api/nexus-assistant] DeepSeek HTTP", res.status, errText.slice(0, 400))
    return null
  }

  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string | null } }>
  }
  const text = json.choices?.[0]?.message?.content?.trim()
  if (!text) return null
  return text
}

export async function POST(req: Request) {
  try {
    const json = await req.json().catch(() => null)
    const parsed = bodySchema.safeParse(json)
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid body", details: parsed.error.flatten() }, { status: 400 })
    }

    const input = parsed.data
    const draft =
      input.precomputedDraft?.trim() ||
      runNexusAssistant({
        userMessage: input.userMessage,
        surface: input.surface,
        tradingUserLevel: input.tradingUserLevel,
        isGuest: input.isGuest,
        authStep: input.authStep,
        focusSymbol: input.focusSymbol,
      })

    const system = buildJoelinDeepseekSystemPrompt(
      {
        surface: input.surface,
        tradingUserLevel: input.tradingUserLevel,
        isGuest: input.isGuest,
        authStep: input.authStep,
        focusSymbol: input.focusSymbol,
      },
      draft
    )

    const joelin = await generateWithDeepSeek(system, input.userMessage)
    const reply = joelin?.trim() || draft
    return NextResponse.json({
      reply,
      source: joelin ? "deepseek" : "local",
    })
  } catch (e) {
    console.error("[api/nexus-assistant]", e)
    return NextResponse.json({ error: "Assistant request failed" }, { status: 500 })
  }
}
