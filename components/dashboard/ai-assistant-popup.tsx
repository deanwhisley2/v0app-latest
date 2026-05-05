"use client"

import { useState, useCallback, useRef, useEffect } from "react"
import {
  X,
  Send,
  Bot,
  Headphones,
  Loader2,
  MessageCircle,
  Sparkles,
  HelpCircle,
  Shield,
  CreditCard,
  TrendingUp,
  ChevronDown,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { TRADING_USER_LEVEL } from "@/lib/trading-user-level"
import { getNexusAssistantWelcome } from "@/lib/nexus-assistant"
import { requestNexusAssistantReply } from "@/lib/nexus-assistant/client"

interface Message {
  role: "user" | "assistant"
  content: string
  timestamp: Date
}

interface AIAssistantPopupProps {
  isOpen: boolean
  onClose: () => void
  context?: "login" | "dashboard"
  isGuestSession?: boolean
}

const QUICK_QUESTIONS = {
  login: [
    { icon: HelpCircle, label: "How do I log in?", query: "How do I log in to my account?" },
    { icon: Shield, label: "Reset password", query: "How do I reset my password?" },
    { icon: MessageCircle, label: "2FA issues", query: "I'm not receiving my 2FA code" },
    { icon: Headphones, label: "Contact support", query: "I need to speak with a human agent" },
  ],
  dashboard: [
    { icon: TrendingUp, label: "How to trade", query: "How do I place a trade?" },
    { icon: CreditCard, label: "Deposit funds", query: "How do I deposit funds to my account?" },
    { icon: Shield, label: "Security settings", query: "How do I enable extra security?" },
    { icon: Headphones, label: "Contact support", query: "I need to speak with a human agent" },
  ],
}

export function AIAssistantPopup({
  isOpen,
  onClose,
  context = "dashboard",
  isGuestSession = false,
}: AIAssistantPopupProps) {
  const surface = context === "login" ? "floating_login" : "floating_dashboard"
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: getNexusAssistantWelcome(surface, isGuestSession),
      timestamp: new Date(),
    },
  ])
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside)
    }
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [isOpen, onClose])

  const handleSubmit = useCallback(async (query?: string) => {
    const message = query || input.trim()
    if (!message) return

    setMessages((prev) => [
      ...prev,
      { role: "user", content: message, timestamp: new Date() },
    ])
    setInput("")
    setIsLoading(true)

    // Response delay (Joelin / DeepSeek)
    await new Promise((r) => setTimeout(r, 1000 + Math.random() * 1000))

    const response = await requestNexusAssistantReply({
      userMessage: message,
      surface,
      isGuest: isGuestSession,
      tradingUserLevel: TRADING_USER_LEVEL,
    })
    setMessages((prev) => [
      ...prev,
      { role: "assistant", content: response, timestamp: new Date() },
    ])
    setIsLoading(false)
  }, [input, surface, isGuestSession])

  const quickQuestions = QUICK_QUESTIONS[context]

  if (!isOpen) return null

  return (
    <div
      ref={panelRef}
      className="fixed bottom-4 right-4 z-[100] w-[380px] max-h-[550px] animate-in slide-in-from-bottom-5 slide-in-from-right-5 duration-300 rounded-2xl border border-border bg-card shadow-2xl overflow-hidden flex flex-col"
    >
      {/* Header */}
      <div className="flex-shrink-0 border-b border-border bg-gradient-to-r from-primary/10 to-accent/10 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-primary to-accent">
              <Bot className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h3 className="font-semibold flex items-center gap-1.5">
                Joelin
                <Sparkles className="h-3.5 w-3.5 text-warning" />
              </h3>
              <p className="text-xs text-muted-foreground">Nexus PRO guide</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-[250px]">
        {messages.map((message, i) => (
          <div
            key={i}
            className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${
                message.role === "user"
                  ? "bg-primary text-primary-foreground rounded-br-md"
                  : "bg-muted rounded-bl-md"
              }`}
            >
              <p className="text-sm whitespace-pre-line">{message.content}</p>
              <p
                className={`mt-1 text-[10px] ${
                  message.role === "user"
                    ? "text-primary-foreground/70"
                    : "text-muted-foreground"
                }`}
              >
                {message.timestamp.toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="rounded-2xl rounded-bl-md bg-muted px-4 py-3">
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span className="text-sm text-muted-foreground">Thinking...</span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Quick Questions */}
      {messages.length <= 2 && (
        <div className="flex-shrink-0 border-t border-border bg-muted/30 px-4 py-3">
          <p className="mb-2 text-xs font-medium text-muted-foreground">Quick questions:</p>
          <div className="flex flex-wrap gap-2">
            {quickQuestions.map((q, i) => (
              <button
                key={i}
                onClick={() => handleSubmit(q.query)}
                className="flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium transition-colors hover:border-primary hover:bg-primary/5"
              >
                <q.icon className="h-3 w-3 text-muted-foreground" />
                {q.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="flex-shrink-0 border-t border-border bg-card px-4 py-3">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            handleSubmit()
          }}
          className="flex items-center gap-2"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your message..."
            disabled={isLoading}
            className="flex-1 rounded-full border border-border bg-background px-4 py-2.5 text-sm outline-none transition-colors focus:border-primary disabled:opacity-50"
          />
          <Button
            type="submit"
            size="icon"
            disabled={isLoading || !input.trim()}
            className="h-10 w-10 rounded-full"
          >
            <Send className="h-4 w-4" />
          </Button>
        </form>
        <p className="mt-2 text-center text-[10px] text-muted-foreground">
          Joelin · Nexus PRO | Type &quot;human&quot; for live support
        </p>
      </div>
    </div>
  )
}

// Floating Joelin entry (optional shell)
export function FloatingJoelinButton({ onClick, hasUnread = false }: { onClick: () => void; hasUnread?: boolean }) {
  return (
    <button
      onClick={onClick}
      className="fixed bottom-4 right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-primary to-accent shadow-lg shadow-primary/30 transition-transform hover:scale-110 active:scale-95"
    >
      <Bot className="h-7 w-7 text-primary-foreground" />
      {hasUnread && (
        <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground">
          !
        </span>
      )}
      <span className="absolute -bottom-1 -right-1 h-3 w-3 animate-ping rounded-full bg-success" />
      <span className="absolute -bottom-1 -right-1 h-3 w-3 rounded-full bg-success" />
    </button>
  )
}

/** @deprecated Use {@link FloatingJoelinButton} */
export const FloatingAIButton = FloatingJoelinButton
