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

interface Message {
  role: "user" | "assistant"
  content: string
  timestamp: Date
}

interface AIAssistantPopupProps {
  isOpen: boolean
  onClose: () => void
  context?: "login" | "dashboard"
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

const AI_RESPONSES: Record<string, string> = {
  // Login related
  "login": "To log in to your Nexus Pro account:\n\n1. Enter your registered email or phone number\n2. Enter your password\n3. Click 'Continue to 2FA'\n4. Select your preferred verification method (email or SMS)\n5. Enter the 6-digit code sent to you\n\nIf you're a new user, click 'Sign Up' to create an account first.",
  "password": "To reset your password:\n\n1. Click 'Forgot Password' on the login screen\n2. Enter your registered email address\n3. Check your email for the reset link\n4. Create a new password (minimum 10 characters)\n5. Log in with your new password\n\nNote: Password reset links expire after 24 hours.",
  "2fa": "If you're not receiving your 2FA verification code:\n\n1. Check your spam/junk folder for email codes\n2. Ensure your phone has signal for SMS codes\n3. Try switching between email and phone verification\n4. Wait 60 seconds before requesting a new code\n5. If issues persist, contact our support team\n\nCodes expire after 10 minutes.",
  "human": "I've notified our support team about your request. A human agent will contact you shortly.\n\n**Ticket Reference:** #NXP-" + Date.now().toString().slice(-6) + "\n\n**Expected Response Time:**\n- Business hours: 15-30 minutes\n- After hours: Within 4 hours\n\nYou'll receive an email notification when an agent responds.",
  // Dashboard related
  "trade": "To place a trade on Nexus Pro:\n\n1. Select a coin from the market list or chart\n2. Go to the Trading Panel on the right\n3. Choose BUY (green) or SELL (red)\n4. Select your order type (Market or Limit)\n5. Enter the amount you want to trade\n6. Adjust leverage if desired (1x-20x)\n7. Click the Buy/Sell button to execute\n\nYour order will be filled instantly at market price, or when limit price is reached.",
  "deposit": "To deposit funds to your Nexus Pro account:\n\n1. Click on 'Portfolio' in the navigation\n2. Select 'Deposit' button\n3. Choose the cryptocurrency you want to deposit\n4. Copy your unique deposit address\n5. Send funds from your external wallet\n\n**Important:** Always double-check the deposit address and network. Deposits typically confirm within 10-30 minutes depending on network congestion.",
  "security": "To enhance your account security:\n\n1. **Enable 2FA** - Already required for all logins\n2. **Whitelist Addresses** - Go to Settings > Security > Whitelist withdrawal addresses\n3. **Anti-Phishing Code** - Set a unique code that appears in all official emails\n4. **Session Management** - Review and terminate active sessions\n5. **API Restrictions** - Limit API key permissions if using automated trading\n\nWe recommend enabling all security features for maximum protection.",
  "default": "I understand you need help. Could you please provide more details about your question? I can assist with:\n\n- Account login and registration\n- Password and 2FA issues\n- Trading and order placement\n- Deposits and withdrawals\n- Security settings\n- Technical support\n\nOr type 'human' to connect with a live support agent.",
}

const getAIResponse = (message: string): string => {
  const lower = message.toLowerCase()
  
  if (lower.includes("login") || lower.includes("sign in") || lower.includes("log in")) {
    return AI_RESPONSES["login"]
  }
  if (lower.includes("password") || lower.includes("forgot") || lower.includes("reset")) {
    return AI_RESPONSES["password"]
  }
  if (lower.includes("2fa") || lower.includes("verification") || lower.includes("code") || lower.includes("otp")) {
    return AI_RESPONSES["2fa"]
  }
  if (lower.includes("human") || lower.includes("agent") || lower.includes("support") || lower.includes("speak")) {
    return AI_RESPONSES["human"]
  }
  if (lower.includes("trade") || lower.includes("buy") || lower.includes("sell") || lower.includes("order")) {
    return AI_RESPONSES["trade"]
  }
  if (lower.includes("deposit") || lower.includes("fund") || lower.includes("add money")) {
    return AI_RESPONSES["deposit"]
  }
  if (lower.includes("security") || lower.includes("safe") || lower.includes("protect")) {
    return AI_RESPONSES["security"]
  }
  
  return AI_RESPONSES["default"]
}

export function AIAssistantPopup({ isOpen, onClose, context = "dashboard" }: AIAssistantPopupProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: context === "login" 
        ? "Hello! I'm Joseline, your Nexus Pro assistant. I can help you with login issues, account creation, 2FA verification, and more. How can I help you today?"
        : "Hi there! I'm Joseline, your trading assistant. I can help with trading, deposits, security settings, and any questions about Nexus Pro. What would you like to know?",
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

    // Simulate AI response delay
    await new Promise((r) => setTimeout(r, 1000 + Math.random() * 1000))

    const response = getAIResponse(message)
    setMessages((prev) => [
      ...prev,
      { role: "assistant", content: response, timestamp: new Date() },
    ])
    setIsLoading(false)
  }, [input])

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
                Joseline
                <Sparkles className="h-3.5 w-3.5 text-warning" />
              </h3>
              <p className="text-xs text-muted-foreground">Your personal assistant</p>
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
          Joseline by Nexus Pro | Type &quot;human&quot; for live support
        </p>
      </div>
    </div>
  )
}

// Floating AI Button Component
export function FloatingAIButton({ onClick, hasUnread = false }: { onClick: () => void; hasUnread?: boolean }) {
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
