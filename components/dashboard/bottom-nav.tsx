"use client"

import { useState } from "react"
import {
  Home,
  TrendingUp,
  Wallet,
  Settings,
  Zap,
} from "lucide-react"

interface BottomNavProps {
  activeTab: string
  onTabChange: (tab: string) => void
}

const navItems = [
  { id: "trade", icon: Home, label: "Trade", color: "from-blue-500 to-cyan-500" },
  { id: "wallstreet", icon: TrendingUp, label: "Wallstreet", color: "from-purple-500 to-pink-500" },
  { id: "wallet", icon: Wallet, label: "Wallet", color: "from-green-500 to-emerald-500" },
  { id: "settings", icon: Settings, label: "Settings", color: "from-orange-500 to-amber-500" },
]

export function BottomNav({ activeTab, onTabChange }: BottomNavProps) {
  const [showAI, setShowAI] = useState(false)

  return (
    <>
      {/* AI Assistant Floating Button */}
      <button
        onClick={() => setShowAI(!showAI)}
        className="fixed bottom-20 right-4 z-50 md:hidden flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-primary to-accent shadow-lg active:scale-95"
      >
        <Zap className="h-5 w-5 text-white" />
      </button>

      {/* AI Mini Panel */}
      {showAI && (
        <div className="fixed bottom-36 right-4 z-50 w-72 rounded-2xl border border-border bg-card p-4 shadow-2xl md:hidden">
          <div className="flex items-center gap-2 mb-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-primary to-accent">
              <Zap className="h-4 w-4 text-white" />
            </div>
            <div>
              <p className="font-semibold text-sm">Joseline AI</p>
              <p className="text-xs text-muted-foreground">Your assistant</p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mb-3">How can I help you today?</p>
          <div className="flex gap-2">
            <input 
              type="text" 
              placeholder="Ask anything..." 
              className="flex-1 rounded-lg bg-muted px-3 py-2 text-xs outline-none"
            />
            <button className="rounded-lg bg-primary px-3 py-2 text-xs font-medium text-white">
              Send
            </button>
          </div>
        </div>
      )}

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card md:hidden">
        <div className="flex items-center justify-around px-2 py-2 safe-area-pb">
          {navItems.map((item) => {
            const isActive = activeTab === item.id
            return (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                className="flex flex-1 flex-col items-center gap-1 py-1"
              >
                {/* Icon Container */}
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                    isActive
                      ? `bg-gradient-to-br ${item.color} shadow-md -translate-y-1`
                      : "bg-transparent"
                  }`}
                >
                  <item.icon
                    className={`h-5 w-5 ${
                      isActive ? "text-white" : "text-muted-foreground"
                    }`}
                  />
                </div>
                {/* Label */}
                <span
                  className={`text-[10px] font-medium ${
                    isActive ? "text-primary" : "text-muted-foreground"
                  }`}
                >
                  {item.label}
                </span>
              </button>
            )
          })}
        </div>
      </nav>
    </>
  )
}
