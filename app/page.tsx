"use client"

import { useState, useMemo, useCallback, useEffect } from "react"
import { AuthScreen } from "@/components/auth/auth-screen"
import { Header } from "@/components/dashboard/header"
import { Ticker } from "@/components/dashboard/ticker"
import { Sidebar } from "@/components/dashboard/sidebar"
import { PriceChart } from "@/components/dashboard/price-chart"
import { OrderBook } from "@/components/dashboard/order-book"
import { TradingPanel } from "@/components/dashboard/trading-panel"
import { MarketTable } from "@/components/dashboard/market-table"
import { AIPanel } from "@/components/dashboard/ai-panel"
import { NewsSection } from "@/components/dashboard/news-section"
import { BottomNav } from "@/components/dashboard/bottom-nav"
import { ToastNotification, useToast } from "@/components/dashboard/toast-notification"
import { WalletScreen } from "@/components/dashboard/wallet-screen"
import { SettingsScreen } from "@/components/dashboard/settings-screen"
import { LiveAnalysisOverlay } from "@/components/dashboard/live-analysis-overlay"
import { ExchangeBinding } from "@/components/dashboard/exchange-binding"
import { NexTradingBot } from "@/components/dashboard/nex-trading-bot"
import { SecurityCenter } from "@/components/dashboard/security-center"
import { DepositWithdraw } from "@/components/dashboard/deposit-withdraw"
import { coinsData } from "@/lib/coins-data"
import type { Coin } from "@/lib/coins-data"
import { useExchangeBalances } from "@/hooks/use-exchange-balances"

interface CurrentUser {
  email: string
  username: string
  fullName: string
  level: number
}

export default function Dashboard() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isMounted, setIsMounted] = useState(false)
  const [activeTab, setActiveTab] = useState("trade")
  const [selectedCoinSymbol, setSelectedCoinSymbol] = useState("BTC")
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null)
  const [showBalance, setShowBalance] = useState(true)
  const [mainBalance, setMainBalance] = useState(24831.42)
  const [showFundModal, setShowFundModal] = useState<"add" | "withdraw" | null>(null)
  const [fundAmount, setFundAmount] = useState("")
  const [fundMethod, setFundMethod] = useState<"mtn" | "airtel" | "bank" | "wallet">("mtn")
  const [fundPhone, setFundPhone] = useState("")
  const [isFundProcessing, setIsFundProcessing] = useState(false)
  const { toast, showToast, hideToast } = useToast()
  
  // Security and Exchange State
  const [securityLevel, setSecurityLevel] = useState<1 | 2 | 3>(1)
  const [connectedExchanges, setConnectedExchanges] = useState<Array<{ id: string; name: string; balance: number; isDefault?: boolean }>>([])
  const [selectedExchangeId, setSelectedExchangeId] = useState<string | undefined>()
  
  // Load connected exchanges from localStorage
  useEffect(() => {
    if (typeof window === "undefined") return
    const stored = localStorage.getItem("nexus_exchanges")
    if (stored) {
      const exchanges = JSON.parse(stored).filter((e: { connected: boolean }) => e.connected)
      setConnectedExchanges(exchanges.map((e: { id: string; name: string; balance: number; isDefault?: boolean }) => ({
        id: e.id,
        name: e.name,
        balance: e.balance || 0,
        isDefault: e.isDefault,
      })))
      const defaultExchange = exchanges.find((e: { isDefault: boolean }) => e.isDefault)
      if (defaultExchange) setSelectedExchangeId(defaultExchange.id)
    }
  }, [])
  
  // Live Analysis State
  const [liveAnalysis, setLiveAnalysis] = useState<{
    active: boolean
    coin: Coin | null
    strategies: string[]
    expertMode: boolean
    autoTrade: boolean
    tradeAmount: number
  }>({
    active: false,
    coin: null,
    strategies: [],
    expertMode: false,
    autoTrade: false,
    tradeAmount: 100,
  })

  // Check for existing session on mount - only runs on client
  useEffect(() => {
    setIsMounted(true)
    try {
      const session = localStorage.getItem("nexus_session")
      if (session) {
        const parsed = JSON.parse(session)
        if (parsed.user) {
          setCurrentUser(parsed.user)
        }
        setIsAuthenticated(true)
      }
    } catch {
      // localStorage not available
    }
  }, [])

  const handleAuthenticated = useCallback((user: CurrentUser) => {
    setCurrentUser(user)
    localStorage.setItem("nexus_session", JSON.stringify({ loggedIn: true, timestamp: Date.now(), user }))
    setIsAuthenticated(true)
  }, [])

  const handleLogout = useCallback(() => {
    localStorage.removeItem("nexus_session")
    setIsAuthenticated(false)
  }, [])

  const selectedCoin = useMemo(
    () => coinsData.find((c) => c.symbol === selectedCoinSymbol) || coinsData[0],
    [selectedCoinSymbol]
  )

  const handleCoinSelect = useCallback((symbol: string) => {
    setSelectedCoinSymbol(symbol)
  }, [])

  const handleOrder = useCallback(
    (type: "buy" | "sell", amount: number, leverage: number) => {
      showToast(
        `${type.toUpperCase()} Order Filled - ${selectedCoin.symbol} @ Market (${leverage}x)`,
        "success"
      )
    },
    [selectedCoin.symbol, showToast]
  )

  // Navigate from Wallstreet to Trade with analysis
  const handleNavigateToTrade = useCallback((
    coin: Coin,
    strategies: string[],
    expertMode: boolean,
    settings: { autoTrade: boolean; tradeAmount: number }
  ) => {
    setSelectedCoinSymbol(coin.symbol)
    setLiveAnalysis({
      active: true,
      coin,
      strategies,
      expertMode,
      autoTrade: settings.autoTrade,
      tradeAmount: settings.tradeAmount,
    })
    setActiveTab("trade")
    showToast(`Live analysis started for ${coin.symbol} with ${strategies.length} strategies`, "success")
  }, [showToast])

  const handleLiveAnalysisTrade = useCallback((type: "buy" | "sell", amount: number) => {
    if (liveAnalysis.coin) {
      showToast(
        `${type.toUpperCase()} Order - ${liveAnalysis.coin.symbol} - $${amount}`,
        type === "buy" ? "success" : "success"
      )
    }
  }, [liveAnalysis.coin, showToast])

  const handleFundSubmit = useCallback(() => {
    const amount = parseFloat(fundAmount)
    if (!amount || amount <= 0) return
    setIsFundProcessing(true)
    setTimeout(() => {
      if (showFundModal === "add") {
        setMainBalance(prev => prev + amount)
        showToast(`$${amount.toFixed(2)} added to your account`, "success")
      } else {
        if (amount > mainBalance) {
          showToast("Insufficient balance", "error")
          setIsFundProcessing(false)
          return
        }
        setMainBalance(prev => prev - amount)
        showToast(`$${amount.toFixed(2)} withdrawal initiated`, "success")
      }
      setIsFundProcessing(false)
      setShowFundModal(null)
      setFundAmount("")
      setFundPhone("")
    }, 1800)
  }, [fundAmount, showFundModal, mainBalance, showToast])

  // Loading state - show nothing during SSR, then show auth or dashboard
  if (!isMounted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  // Show auth screen if not authenticated
  if (!isAuthenticated) {
    return <AuthScreen onAuthenticated={handleAuthenticated} />
  }

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-0">
      {/* Header */}
      <Header
        activeTab={activeTab}
        onTabChange={setActiveTab}
        coins={coinsData}
        currentUser={currentUser ?? undefined}
        onLogout={handleLogout}
      />

      {/* Ticker */}
      <Ticker coins={coinsData.slice(0, 15)} />

      {/* Main Balance Card */}
      <div className="mx-auto max-w-[1600px] px-4 pt-4">
        <div className="mb-4 rounded-xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-center gap-4">
            {/* Balance Info */}
            <div className="flex flex-1 items-center gap-4 min-w-0">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10">
                <svg className="h-6 w-6 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                </svg>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm text-muted-foreground">Main Account Balance</p>
                  <button
                    onClick={() => setShowBalance(!showBalance)}
                    className="text-muted-foreground transition-colors hover:text-foreground"
                    title={showBalance ? "Hide balance" : "Show balance"}
                  >
                    {showBalance ? (
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                      </svg>
                    ) : (
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                </div>
                <p className="font-mono text-2xl font-bold text-foreground">
                  {showBalance ? `$${mainBalance.toLocaleString("en-US", { minimumFractionDigits: 2 })}` : "••••••••"}
                </p>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => { setShowFundModal("add"); setFundAmount(""); setFundPhone(""); }}
                className="flex items-center gap-2 rounded-lg bg-success px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-success/90"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add Funds
              </button>
              <button
                onClick={() => { setShowFundModal("withdraw"); setFundAmount(""); setFundPhone(""); }}
                className="flex items-center gap-2 rounded-lg border border-border bg-muted px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-muted/80"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4l-8 8 8 8" />
                </svg>
                Withdraw
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Add Fund / Withdraw Modal */}
      {showFundModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl">
            {/* Modal Header */}
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-xl font-bold">
                {showFundModal === "add" ? "Add Funds" : "Withdraw Funds"}
              </h2>
              <button
                onClick={() => setShowFundModal(null)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-muted-foreground hover:bg-muted/80"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Payment Methods */}
            <div className="mb-4 grid grid-cols-2 gap-2">
              {[
                { id: "mtn" as const, name: "MTN Mobile Money", color: "#FFCC00", textColor: "#000" },
                { id: "airtel" as const, name: "Airtel Money", color: "#ED1C24", textColor: "#fff" },
                { id: "bank" as const, name: "Bank Transfer", color: "#1E40AF", textColor: "#fff" },
                { id: "wallet" as const, name: "Crypto Wallet", color: "#8B5CF6", textColor: "#fff" },
              ].map((m) => (
                <button
                  key={m.id}
                  onClick={() => setFundMethod(m.id)}
                  className={`rounded-xl border-2 px-3 py-3 text-left transition-all ${fundMethod === m.id ? "border-primary" : "border-border"}`}
                >
                  <div className="mb-1 h-1.5 w-6 rounded-full" style={{ backgroundColor: m.color }} />
                  <p className="text-xs font-semibold">{m.name}</p>
                </button>
              ))}
            </div>

            {/* Amount */}
            <div className="mb-4">
              <label className="mb-1.5 block text-sm font-medium text-muted-foreground">Amount (USD)</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                <input
                  type="number"
                  value={fundAmount}
                  onChange={(e) => setFundAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full rounded-lg border border-border bg-background py-3 pl-8 pr-4 font-mono text-lg outline-none transition-colors focus:border-primary"
                />
              </div>
              {showFundModal === "withdraw" && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Available: ${showBalance ? mainBalance.toLocaleString("en-US", { minimumFractionDigits: 2 }) : "••••"}
                </p>
              )}
              <div className="mt-2 flex gap-2">
                {[50, 100, 250, 500].map((amt) => (
                  <button
                    key={amt}
                    onClick={() => setFundAmount(amt.toString())}
                    className="flex-1 rounded-lg bg-muted py-2 text-xs font-medium hover:bg-muted/80"
                  >
                    ${amt}
                  </button>
                ))}
              </div>
            </div>

            {/* Phone for mobile money */}
            {(fundMethod === "mtn" || fundMethod === "airtel") && (
              <div className="mb-4">
                <label className="mb-1.5 block text-sm font-medium text-muted-foreground">Phone Number</label>
                <input
                  type="tel"
                  value={fundPhone}
                  onChange={(e) => setFundPhone(e.target.value)}
                  placeholder="+256 7XX XXX XXX"
                  className="w-full rounded-lg border border-border bg-background py-3 px-4 text-sm outline-none transition-colors focus:border-primary"
                />
              </div>
            )}

            {/* Bank info for deposit */}
            {fundMethod === "bank" && showFundModal === "add" && (
              <div className="mb-4 rounded-lg bg-muted/50 p-3 text-xs space-y-1">
                <p className="font-semibold text-foreground">Bank Transfer Details</p>
                <div className="flex justify-between"><span className="text-muted-foreground">Bank:</span><span className="font-mono">Nexus Trading Bank</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Account:</span><span className="font-mono">1234567890</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">SWIFT:</span><span className="font-mono">NXTRUGKA</span></div>
              </div>
            )}

            {/* Submit */}
            <button
              onClick={handleFundSubmit}
              disabled={!fundAmount || isFundProcessing}
              className={`flex w-full items-center justify-center gap-2 rounded-lg py-3 font-semibold text-white transition-colors disabled:opacity-50 ${
                showFundModal === "add" ? "bg-success hover:bg-success/90" : "bg-primary hover:bg-primary/90"
              }`}
            >
              {isFundProcessing ? (
                <>
                  <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Processing...
                </>
              ) : showFundModal === "add" ? (
                `Add $${fundAmount || "0"}`
              ) : (
                `Withdraw $${fundAmount || "0"}`
              )}
            </button>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="mx-auto max-w-[1600px] px-4 pb-24 md:pb-4">
        {activeTab === "trade" && (
          <div className="flex flex-col gap-4 lg:flex-row">
            {/* Sidebar - hidden on mobile */}
            <div className="hidden lg:block lg:w-[240px] lg:flex-shrink-0">
              <Sidebar
                coins={coinsData}
                portfolioTotal={24831.42}
                portfolioChange={12.4}
              />
            </div>

            {/* Main Area */}
            <main className="flex min-w-0 flex-1 flex-col gap-4">
              {/* Chart with Live Analysis Overlay */}
              <div className="relative">
                <PriceChart
                  selectedCoin={selectedCoin}
                  onCoinSelect={handleCoinSelect}
                  coins={coinsData}
                />
                {liveAnalysis.active && liveAnalysis.coin && (
                  <LiveAnalysisOverlay
                    coin={liveAnalysis.coin}
                    strategies={liveAnalysis.strategies}
                    expertMode={liveAnalysis.expertMode}
                    autoTrade={liveAnalysis.autoTrade}
                    tradeAmount={liveAnalysis.tradeAmount}
                    onClose={() => setLiveAnalysis((prev) => ({ ...prev, active: false }))}
                    onTrade={handleLiveAnalysisTrade}
                    onToggleAutoTrade={() => setLiveAnalysis((prev) => ({ ...prev, autoTrade: !prev.autoTrade }))}
                  />
                )}
              </div>

              {/* Trading Row - stacks on mobile, 3 columns on desktop */}
              <div className="flex flex-col gap-4 lg:grid lg:grid-cols-3">
                {/* Order Book */}
                <div className="w-full">
                  <OrderBook selectedCoin={selectedCoin} />
                </div>

                {/* NEX Trading Bot or Classic Trading Panel */}
                <div className="w-full">
                  {connectedExchanges.length > 0 ? (
                    <NexTradingBot 
                      selectedCoin={selectedCoin} 
                      connectedExchanges={connectedExchanges}
                      onExecuteTrade={(params) => {
                        showToast(
                          `NEX ${params.mode === "auto" ? "AI" : ""} Trade Executed - ${params.strategy} strategy applied to ${params.coin} with $${params.amount}`,
                          "success"
                        )
                      }}
                    />
                  ) : (
                    <TradingPanel selectedCoin={selectedCoin} onOrder={handleOrder} />
                  )}
                </div>

                {/* News */}
                <div className="w-full">
                  <NewsSection />
                </div>
              </div>
            </main>
          </div>
        )}

        {activeTab === "markets" && (
          <div className="flex flex-col gap-4 lg:flex-row">
            <div className="hidden lg:block lg:w-[240px] lg:flex-shrink-0">
              <Sidebar
                coins={coinsData}
                portfolioTotal={24831.42}
                portfolioChange={12.4}
              />
            </div>
            <main className="min-w-0 flex-1">
              <MarketTable
                coins={coinsData}
                onCoinSelect={handleCoinSelect}
                selectedCoin={selectedCoin}
              />
            </main>
          </div>
        )}

        {activeTab === "wallstreet" && (
          <div className="flex flex-col gap-4 lg:flex-row">
            <div className="hidden lg:block lg:w-[240px] lg:flex-shrink-0">
              <Sidebar
                coins={coinsData}
                portfolioTotal={24831.42}
                portfolioChange={12.4}
              />
            </div>
            <main className="min-w-0 flex-1">
              <AIPanel 
                coins={coinsData} 
                selectedCoin={selectedCoin} 
                onNavigateToTrade={handleNavigateToTrade}
                userLevel={(currentUser?.level || 1) as 1 | 2 | 3 | 4 | 5}
              />
            </main>
          </div>
        )}

        {activeTab === "wallet" && (
          <div className="flex flex-col gap-4 lg:flex-row">
            <div className="hidden lg:block lg:w-[240px] lg:flex-shrink-0">
              <Sidebar
                coins={coinsData}
                portfolioTotal={24831.42}
                portfolioChange={12.4}
              />
            </div>
            <main className="min-w-0 flex-1">
              <WalletScreen coins={coinsData} />
            </main>
          </div>
        )}

        {activeTab === "settings" && (
          <div className="flex flex-col gap-4 lg:flex-row">
            <div className="hidden lg:block lg:w-[240px] lg:flex-shrink-0">
              <Sidebar
                coins={coinsData}
                portfolioTotal={24831.42}
                portfolioChange={12.4}
              />
            </div>
            <main className="min-w-0 flex-1">
              <SettingsScreen onLogout={handleLogout} />
            </main>
          </div>
        )}
      </div>

      {/* Mobile Bottom Nav */}
      <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />

      {/* Toast */}
      <ToastNotification
        message={toast.message}
        type={toast.type}
        isVisible={toast.isVisible}
        onClose={hideToast}
      />
    </div>
  )
}
