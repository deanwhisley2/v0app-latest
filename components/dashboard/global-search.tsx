"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { 
  Search, 
  X, 
  TrendingUp, 
  Settings, 
  Wallet, 
  User, 
  Shield,
  Bell,
  CreditCard,
  HelpCircle,
  ArrowRight,
  Sparkles,
  History,
  Star,
  Receipt,
  ArrowUpDown,
  CheckCircle2,
  Clock,
} from "lucide-react"

interface SearchResult {
  id: string
  title: string
  description: string
  category: "coin" | "settings" | "wallet" | "help" | "action" | "order"
  icon: React.ReactNode
  action?: () => void
  path?: string
}

interface GlobalSearchProps {
  isOpen: boolean
  onClose: () => void
  onNavigate: (tab: string) => void
  coins: Array<{ symbol: string; name: string; price: number; change24h: number }>
}

const settingsItems: Omit<SearchResult, "id">[] = [
  { title: "Profile Settings", description: "Manage your personal information", category: "settings", icon: <User className="h-4 w-4" />, path: "settings" },
  { title: "Security", description: "2FA, password, device management", category: "settings", icon: <Shield className="h-4 w-4" />, path: "settings" },
  { title: "Notifications", description: "Configure alerts and notifications", category: "settings", icon: <Bell className="h-4 w-4" />, path: "settings" },
  { title: "Payment Methods", description: "Manage cards and bank accounts", category: "settings", icon: <CreditCard className="h-4 w-4" />, path: "settings" },
  { title: "Language & Currency", description: "Change display preferences", category: "settings", icon: <Settings className="h-4 w-4" />, path: "settings" },
]

const walletItems: Omit<SearchResult, "id">[] = [
  { title: "Send Crypto", description: "Move funds to an external address", category: "wallet", icon: <ArrowRight className="h-4 w-4" />, path: "settings" },
  { title: "Receive Crypto", description: "Get your deposit details", category: "wallet", icon: <Wallet className="h-4 w-4" />, path: "settings" },
  { title: "Transaction History", description: "See recent money movements", category: "wallet", icon: <History className="h-4 w-4" />, path: "notifications" },
  { title: "Portfolio Overview", description: "See balances at a glance", category: "wallet", icon: <TrendingUp className="h-4 w-4" />, path: "settings" },
  { title: "Earn Rewards", description: "Rewards and promos", category: "wallet", icon: <Sparkles className="h-4 w-4" />, path: "notifications" },
]

const helpItems: Omit<SearchResult, "id">[] = [
  { title: "How to Trade", description: "Learn trading basics", category: "help", icon: <HelpCircle className="h-4 w-4" /> },
  { title: "Deposit Funds", description: "Add money to your account", category: "help", icon: <HelpCircle className="h-4 w-4" /> },
  { title: "Withdraw Funds", description: "Cash out your crypto", category: "help", icon: <HelpCircle className="h-4 w-4" /> },
  { title: "Contact Support", description: "Support desk", category: "help", icon: <HelpCircle className="h-4 w-4" /> },
]


const appNavItems: Omit<SearchResult, "id">[] = [
  { title: "Notifications", description: "Funding, withdrawals, and alerts", category: "wallet", icon: <Bell className="h-4 w-4" />, path: "notifications" },
  { title: "Deposit funds", description: "Add money to your account", category: "wallet", icon: <Wallet className="h-4 w-4" />, path: "settings" },
  { title: "Withdraw", description: "Cash out to your pocket", category: "wallet", icon: <ArrowUpDown className="h-4 w-4" />, path: "settings" },
  { title: "Container desk", description: "Copy and fixed trades", category: "action", icon: <TrendingUp className="h-4 w-4" />, path: "container" },
  { title: "Account balances", description: "Main, container, and exchange", category: "wallet", icon: <Receipt className="h-4 w-4" />, path: "settings" },
]

const quickActions: Omit<SearchResult, "id">[] = [
  { title: "Buy Bitcoin", description: "Quick buy BTC", category: "action", icon: <Sparkles className="h-4 w-4 text-warning" />, path: "trade" },
  { title: "Sell Ethereum", description: "Quick sell ETH", category: "action", icon: <Sparkles className="h-4 w-4 text-warning" />, path: "trade" },
  { title: "View Markets", description: "See all available coins", category: "action", icon: <TrendingUp className="h-4 w-4" />, path: "markets" },
  { title: "Chat · Nexus Assistant", description: "AI help, support, and account messages", category: "action", icon: <Sparkles className="h-4 w-4 text-primary" />, path: "chat" },
]

const mockOrders: Omit<SearchResult, "id">[] = [
  { title: "ORD-001 - Buy BTC", description: "$500 - Completed", category: "order", icon: <CheckCircle2 className="h-4 w-4 text-success" />, path: "notifications" },
  { title: "ORD-002 - Sell ETH", description: "$250 - Completed", category: "order", icon: <CheckCircle2 className="h-4 w-4 text-success" />, path: "notifications" },
  { title: "ORD-003 - Buy SOL", description: "$100 - Pending", category: "order", icon: <Clock className="h-4 w-4 text-warning" />, path: "notifications" },
  { title: "ORD-004 - Buy BTC", description: "$1,200 - Completed", category: "order", icon: <CheckCircle2 className="h-4 w-4 text-success" />, path: "notifications" },
  { title: "ORD-005 - Sell ADA", description: "$350 - Completed", category: "order", icon: <CheckCircle2 className="h-4 w-4 text-success" />, path: "notifications" },
  { title: "ORD-006 - Buy ETH", description: "$800 - Pending", category: "order", icon: <Clock className="h-4 w-4 text-warning" />, path: "notifications" },
  { title: "ORD-007 - Sell DOGE", description: "$50 - Cancelled", category: "order", icon: <X className="h-4 w-4 text-destructive" />, path: "notifications" },
]

export function GlobalSearch({ isOpen, onClose, onNavigate, coins }: GlobalSearchProps) {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<SearchResult[]>([])
  const [recentSearches, setRecentSearches] = useState<string[]>([])
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const resultsRef = useRef<HTMLDivElement>(null)

  // Focus input when opened
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus()
      setQuery("")
      setResults([])
      setSelectedIndex(-1)
    }
  }, [isOpen])

  // Load recent searches from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("nexus_recent_searches")
    if (saved) {
      setRecentSearches(JSON.parse(saved))
    }
  }, [])

  // Close on escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", handleEscape)
    return () => window.removeEventListener("keydown", handleEscape)
  }, [onClose])

  // Search function
  const performSearch = useCallback((searchQuery: string) => {
    if (!searchQuery.trim()) {
      setResults([])
      return
    }

    const q = searchQuery.toLowerCase()
    const searchResults: SearchResult[] = []

    // Search coins
    coins.forEach((coin) => {
      if (coin.symbol.toLowerCase().includes(q) || coin.name.toLowerCase().includes(q)) {
        searchResults.push({
          id: `coin-${coin.symbol}`,
          title: `${coin.name} (${coin.symbol})`,
          description: `$${coin.price.toLocaleString()} | ${coin.change24h >= 0 ? "+" : ""}${coin.change24h.toFixed(2)}%`,
          category: "coin",
          icon: <TrendingUp className={`h-4 w-4 ${coin.change24h >= 0 ? "text-success" : "text-destructive"}`} />,
          path: "trade"
        })
      }
    })

    // Search settings
    settingsItems.forEach((item, i) => {
      if (item.title.toLowerCase().includes(q) || item.description.toLowerCase().includes(q)) {
        searchResults.push({ ...item, id: `settings-${i}` })
      }
    })

    appNavItems.forEach((item, i) => {
      if (item.title.toLowerCase().includes(q) || item.description.toLowerCase().includes(q)) {
        searchResults.push({ ...item, id: `nav-${i}` })
      }
    })

    // Search wallet items
    walletItems.forEach((item, i) => {
      if (item.title.toLowerCase().includes(q) || item.description.toLowerCase().includes(q)) {
        searchResults.push({ ...item, id: `wallet-${i}` })
      }
    })

    // Search help items
    helpItems.forEach((item, i) => {
      if (item.title.toLowerCase().includes(q) || item.description.toLowerCase().includes(q)) {
        searchResults.push({ ...item, id: `help-${i}` })
      }
    })

    // Search quick actions
    quickActions.forEach((item, i) => {
      if (item.title.toLowerCase().includes(q) || item.description.toLowerCase().includes(q)) {
        searchResults.push({ ...item, id: `action-${i}` })
      }
    })

    // Search orders
    mockOrders.forEach((item, i) => {
      if (item.title.toLowerCase().includes(q) || item.description.toLowerCase().includes(q)) {
        searchResults.push({ ...item, id: `order-${i}` })
      }
    })

    setResults(searchResults.slice(0, 12))
    setSelectedIndex(-1)
  }, [coins])

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => performSearch(query), 150)
    return () => clearTimeout(timer)
  }, [query, performSearch])

  const handleResultClick = (result: SearchResult) => {
    // Save to recent searches
    const newRecent = [result.title, ...recentSearches.filter(r => r !== result.title)].slice(0, 5)
    setRecentSearches(newRecent)
    localStorage.setItem("nexus_recent_searches", JSON.stringify(newRecent))

    // Navigate
    if (result.path) {
      onNavigate(result.path)
    }
    onClose()
    setQuery("")
  }

  // Keyboard navigation for results
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setSelectedIndex(prev => Math.min(prev + 1, results.length - 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setSelectedIndex(prev => Math.max(prev - 1, 0))
    } else if (e.key === "Enter" && selectedIndex >= 0 && results[selectedIndex]) {
      e.preventDefault()
      handleResultClick(results[selectedIndex])
    }
  }

  // Scroll selected item into view
  useEffect(() => {
    if (selectedIndex >= 0 && resultsRef.current) {
      const selectedEl = resultsRef.current.querySelector(`[data-index="${selectedIndex}"]`)
      if (selectedEl) {
        selectedEl.scrollIntoView({ block: "nearest" })
      }
    }
  }, [selectedIndex])

  const getCategoryLabel = (category: SearchResult["category"]) => {
    const labels = {
      coin: "Coin",
      settings: "Settings",
      wallet: "Wallet",
      help: "Help",
      action: "Action",
      order: "Order"
    }
    return labels[category]
  }

  const getCategoryColor = (category: SearchResult["category"]) => {
    const colors = {
      coin: "bg-warning/10 text-warning",
      settings: "bg-muted text-muted-foreground",
      wallet: "bg-primary/10 text-primary",
      help: "bg-blue-500/10 text-blue-500",
      action: "bg-success/10 text-success",
      order: "bg-purple-500/10 text-purple-500"
    }
    return colors[category]
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-20 sm:pt-32">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Search Modal */}
      <div className="relative w-full max-w-2xl mx-4 animate-in fade-in slide-in-from-top-4 duration-200">
        <div className="rounded-2xl border border-border bg-card shadow-2xl shadow-primary/10 overflow-hidden">
          {/* Search Input */}
          <div className="flex items-center gap-3 border-b border-border p-4">
            <Search className="h-5 w-5 text-muted-foreground shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search coins, settings, orders, wallets..."
              className="flex-1 bg-transparent text-lg outline-none placeholder:text-muted-foreground"
            />
            {query && (
              <button 
                onClick={() => setQuery("")}
                className="rounded-full p-1 hover:bg-muted"
              >
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            )}
            <kbd className="hidden sm:inline-flex items-center gap-1 rounded border border-border bg-muted px-2 py-1 text-xs text-muted-foreground">
              ESC
            </kbd>
          </div>

          {/* Results or Default Content */}
          <div ref={resultsRef} className="max-h-[60vh] overflow-y-auto p-2">
            {query ? (
              results.length > 0 ? (
                <div className="space-y-1">
                  {results.map((result, index) => (
                    <button
                      key={result.id}
                      data-index={index}
                      onClick={() => handleResultClick(result)}
                      className={`flex w-full items-center gap-3 rounded-lg p-3 text-left transition-colors ${
                        selectedIndex === index 
                          ? "bg-primary/10 ring-1 ring-primary/30" 
                          : "hover:bg-muted"
                      }`}
                    >
                      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${getCategoryColor(result.category)}`}>
                        {result.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{result.title}</p>
                        <p className="text-sm text-muted-foreground truncate">{result.description}</p>
                      </div>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${getCategoryColor(result.category)}`}>
                        {getCategoryLabel(result.category)}
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="py-12 text-center">
                  <Search className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
                  <p className="text-muted-foreground">No results found for "{query}"</p>
                  <p className="mt-1 text-sm text-muted-foreground/70">Try searching for coins, settings, orders, or actions</p>
                </div>
              )
            ) : (
              <div className="space-y-6 p-2">
                {/* Recent Searches */}
                {recentSearches.length > 0 && (
                  <div>
                    <p className="mb-2 flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                      <History className="h-3 w-3" /> RECENT SEARCHES
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {recentSearches.map((search, i) => (
                        <button
                          key={i}
                          onClick={() => setQuery(search)}
                          className="rounded-full border border-border bg-muted/50 px-3 py-1.5 text-sm hover:bg-muted"
                        >
                          {search}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Quick Actions */}
                <div>
                  <p className="mb-2 flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                    <Sparkles className="h-3 w-3" /> QUICK ACTIONS
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {quickActions.map((action, i) => (
                      <button
                        key={i}
                        onClick={() => handleResultClick({ ...action, id: `quick-${i}` })}
                        className="flex items-center gap-3 rounded-lg border border-border p-3 text-left transition-colors hover:bg-muted"
                      >
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                          {action.icon}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{action.title}</p>
                          <p className="text-xs text-muted-foreground truncate">{action.description}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Popular Coins */}
                <div>
                  <p className="mb-2 flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                    <Star className="h-3 w-3" /> POPULAR COINS
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {coins.slice(0, 6).map((coin) => (
                      <button
                        key={coin.symbol}
                        onClick={() => setQuery(coin.symbol)}
                        className="flex items-center gap-2 rounded-full border border-border bg-muted/50 px-3 py-1.5 text-sm hover:bg-muted"
                      >
                        <span className="font-semibold">{coin.symbol}</span>
                        <span className={coin.change24h >= 0 ? "text-success" : "text-destructive"}>
                          {coin.change24h >= 0 ? "+" : ""}{coin.change24h.toFixed(1)}%
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-border bg-muted/30 px-4 py-2">
            <p className="text-center text-xs text-muted-foreground">
              <kbd className="mx-1 rounded border border-border bg-background px-1.5 py-0.5">↑↓</kbd> Navigate
              <kbd className="mx-1 rounded border border-border bg-background px-1.5 py-0.5">Enter</kbd> Select
              <kbd className="mx-1 rounded border border-border bg-background px-1.5 py-0.5">ESC</kbd> Close
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
