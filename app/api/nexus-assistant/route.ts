import { NextResponse } from "next/server"
import { z } from "zod"
import { getUserFromBearer } from "@/lib/auth-api"
import { runNexusAssistant } from "@/lib/nexus-assistant/model"
import type { NexusAssistantSurface } from "@/lib/nexus-assistant/types"
import { buildJoelinDeepseekSystemPrompt } from "@/lib/nexus-assistant/deepseek-prompt"
import { createRouteHandlerSupabaseClient } from "@/lib/supabase/route-handler"
import {
  assistantEscalationReplySuffix,
  maybeEscalateAssistantToOperations,
} from "@/lib/server/assistant-operational-escalation"

const surfaces: [NexusAssistantSurface, ...NexusAssistantSurface[]] = [
  "auth_screen",
  "settings_learner",
  "floating_login",
  "floating_dashboard",
  "dashboard_wallstreet_assistant",
  "dashboard_chat",
  "bottom_nav_mini",
  "admin_desk_support_chat",
]

const bodySchema = z.object({
  userMessage: z.string().max(6000),
  surface: z.enum(surfaces),
  tradingUserLevel: z.number().int().min(1).max(99).default(1),
  isGuest: z.boolean().default(false),
  authStep: z.string().max(64).optional(),
  focusSymbol: z.string().max(32).optional(),
  precomputedDraft: z.string().max(12000).optional(),
  appLanguage: z.string().max(8).optional(),
  fundingCountryCode: z.string().max(2).optional(),
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
        appLanguage: input.appLanguage,
        fundingCountryCode: input.fundingCountryCode,
      },
      draft
    )

    const deepseek = await generateWithDeepSeek(system, input.userMessage)
    let reply = deepseek?.trim() || draft

    let escalation: { threadId: string; created: boolean } | null = null
    if (!input.isGuest && input.tradingUserLevel !== 5 && input.surface !== "admin_desk_support_chat") {
      try {
        const bearerUser = await getUserFromBearer(req)
        const cookieClient = bearerUser ? null : await createRouteHandlerSupabaseClient()
        const sessionUser =
          bearerUser ??
          (cookieClient ? (await cookieClient.auth.getUser()).data.user ?? null : null)
        if (sessionUser) {
          const esc = await maybeEscalateAssistantToOperations(sessionUser, input.userMessage, {
            tradingUserLevel: input.tradingUserLevel,
            isGuest: input.isGuest,
          })
          if (esc) {
            escalation = { threadId: esc.threadId, created: esc.created }
            reply = `${reply.trim()}${assistantEscalationReplySuffix(esc.threadId)}`
          }
        }
      } catch (e) {
        console.error("[api/nexus-assistant] operational escalation failed", e)
      }
    }

    return NextResponse.json({
      reply,
      source: deepseek ? "deepseek" : "local",
      escalation,
    })
  } catch (e) {
    console.error("[api/nexus-assistant]", e)
    return NextResponse.json({ error: "Assistant request failed" }, { status: 500 })
  }
}
