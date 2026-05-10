"use client"

import { useState, useMemo, useEffect } from "react"
import {
  Wallet,
  Send,
  Download,
  History,
  ShieldCheck,
  Percent,
  PieChart,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ArrowDownRight,
  Copy,
  CheckCircle2,
  Clock,
  XCircle,
  ChevronRight,
  QrCode,
  Sparkles,
  Lock,
  RefreshCw,
  Smartphone,
  Building2,
  CreditCard,
  Loader2,
  Plus,
  Minus,
} from "lucide-react"
import { Card } from "@/components/ui/card"
import { AdminOperationalAssets, RetailerOperationalAssets } from "@/components/dashboard/wallet-operational-panel"

interface WalletScreenProps {
  coins: Array<{
    symbol: string
    name: string
    price: number
    change24h: number
    color: string
  }>
  tradingUserLevel?: number
  retailerCreditDesk?: boolean
  isGuestSession?: boolean
}

type WalletTab = "portfolio" | "assets" | "earn"
type AssetSubTab = "send" | "receive" | "history" | "approval" | "deposit" | "withdraw"
type PaymentMethod = "mtn" | "airtel" | "bank" | "wallet"

export function WalletScreen({
  coins,
  tradingUserLevel = 1,
  retailerCreditDesk = false,
  isGuestSession = false,
}: WalletScreenProps) {
  const [activeTab, setActiveTab] = useState<WalletTab>("portfolio")
  const [assetSubTab, setAssetSubTab] = useState<AssetSubTab>("send")
  const [selectedCoin, setSelectedCoin] = useState(coins[0])
  const [sendAmount, setSendAmount] = useState("")
  const [recipientAddress, setRecipientAddress] = useState("")
  const [copiedAddress, setCopiedAddress] = useState(false)
  const [earnFilter, setEarnFilter] = useState<"all" | "flexible" | "fixed">("all")
  const [subscribingCoin, setSubscribingCoin] = useState<string | null>(null)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("mtn")
  const [depositAmount, setDepositAmount] = useState("")
  const [withdrawAmount, setWithdrawAmount] = useState("")
  const [phoneNumber, setPhoneNumber] = useState("")
  const [bankAccount, setBankAccount] = useState("")
  const [walletAddress, setWalletAddress] = useState("")
  const [isProcessing, setIsProcessing] = useState(false)

  /** Liquidity admins and retail desks: land on Assets (operational panels), not demo portfolio. */
  useEffect(() => {
    if (tradingUserLevel === 5 || retailerCreditDesk) {
      setActiveTab("assets")
    }
  }, [tradingUserLevel, retailerCreditDesk])

  // Generate holdings with random balances
  const holdings = useMemo(() => 
    coins.slice(0, 8).map((coin) => ({
      ...coin,
      balance: Math.random() * 10,
      value: coin.price * Math.random() * 10,
    })), [coins])

  const totalValue = holdings.reduce((sum, h) => sum + h.value, 0)

  // Transaction history
  const transactions = [
    { id: 1, type: "receive", coin: "BTC", amount: 0.05, status: "completed", time: "2 hours ago", from: "0x1234...5678" },
    { id: 2, type: "send", coin: "ETH", amount: 1.2, status: "pending", time: "5 hours ago", to: "0x8765...4321" },
    { id: 3, type: "receive", coin: "USDT", amount: 500, status: "completed", time: "1 day ago", from: "0xabcd...efgh" },
    { id: 4, type: "send", coin: "SOL", amount: 10, status: "failed", time: "2 days ago", to: "0xijkl...mnop" },
  ]

  // Pending approvals
  const approvals = [
    { id: 1, type: "withdrawal", coin: "BTC", amount: 0.1, status: "pending", time: "10 min ago" },
    { id: 2, type: "device", device: "iPhone 15 Pro", location: "New York, USA", time: "1 hour ago" },
    { id: 3, type: "api_key", name: "Trading Bot #1", permissions: ["Trade", "Read"], time: "3 hours ago" },
  ]

  // Earn options
  const earnOptions = [
    { coin: "USDT", apy: 100, term: "7 days", minAmount: 100, isPromo: true },
    { coin: "USDC", apy: 8.5, term: "Flexible", minAmount: 50 },
    { coin: "BTC", apy: 3.2, term: "30 days", minAmount: 0.001 },
    { coin: "ETH", apy: 4.5, term: "Flexible", minAmount: 0.01 },
    { coin: "SOL", apy: 5.6, term: "60 days", minAmount: 1 },
    { coin: "AVAX", apy: 6.8, term: "30 days", minAmount: 1 },
  ]

  const filteredEarnOptions = earnOptions.filter((opt) => {
    if (earnFilter === "all") return true
    if (earnFilter === "flexible") return opt.term === "Flexible"
    return opt.term !== "Flexible"
  })

  const handleCopyAddress = () => {
    navigator.clipboard.writeText("0x742d35Cc6634C0532925a3b844Bc9e7595f8fE21")
    setCopiedAddress(true)
    setTimeout(() => setCopiedAddress(false), 2000)
  }

  const handleSend = () => {
    if (sendAmount && recipientAddress) {
      alert(`Sending ${sendAmount} ${selectedCoin.symbol} to ${recipientAddress}`)
      setSendAmount("")
      setRecipientAddress("")
    }
  }

  const handleSubscribe = (coinSymbol: string) => {
    setSubscribingCoin(coinSymbol)
    setTimeout(() => {
      setSubscribingCoin(null)
      alert(`Successfully subscribed to ${coinSymbol} staking!`)
    }, 1500)
  }

  const handleDeposit = () => {
    if (!depositAmount) return
    setIsProcessing(true)
    setTimeout(() => {
      setIsProcessing(false)
      alert(`Deposit of $${depositAmount} initiated via ${paymentMethod.toUpperCase()}. You will receive a confirmation shortly.`)
      setDepositAmount("")
      setPhoneNumber("")
      setBankAccount("")
    }, 2000)
  }

  const handleWithdraw = () => {
    if (!withdrawAmount) return
    setIsProcessing(true)
    setTimeout(() => {
      setIsProcessing(false)
      alert(`Withdrawal of $${withdrawAmount} to ${paymentMethod.toUpperCase()} initiated. Processing time: 1-3 business days.`)
      setWithdrawAmount("")
      setPhoneNumber("")
      setBankAccount("")
      setWalletAddress("")
    }, 2000)
  }

  const paymentMethods = [
    { id: "mtn" as const, name: "MTN Mobile Money", icon: Smartphone, color: "#FFCC00", description: "Instant deposit & withdraw" },
    { id: "airtel" as const, name: "Airtel Money", icon: Smartphone, color: "#ED1C24", description: "Instant deposit & withdraw" },
    { id: "bank" as const, name: "Bank Transfer", icon: Building2, color: "#1E40AF", description: "1-3 business days" },
    { id: "wallet" as const, name: "Crypto Wallet", icon: Wallet, color: "#8B5CF6", description: "Network fees apply" },
  ]

  const tabs: { id: WalletTab; label: string; icon: React.ElementType }[] = [
    { id: "portfolio", label: "Portfolio", icon: PieChart },
    { id: "assets", label: "Assets", icon: Wallet },
    { id: "earn", label: "Earn", icon: Percent },
  ]

  return (
    <div className="space-y-4">
      {/* Tab Navigation */}
      <div className="flex gap-2 rounded-xl border border-border bg-card p-1.5">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all ${
              activeTab === tab.id
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Portfolio Tab */}
      {activeTab === "portfolio" && (
        <div className="space-y-4">
          {/* Portfolio Summary */}
          <Card className="border-border bg-card p-6">
            <h2 className="mb-4 text-lg font-semibold">Portfolio Overview</h2>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-lg bg-gradient-to-br from-primary/20 to-primary/5 p-4 text-center">
                <p className="text-sm text-muted-foreground">Total Value</p>
                <p className="font-mono text-2xl font-bold text-primary">
                  ${totalValue.toLocaleString("en-US", { maximumFractionDigits: 2 })}
                </p>
              </div>
              <div className="rounded-lg bg-gradient-to-br from-success/20 to-success/5 p-4 text-center">
                <p className="text-sm text-muted-foreground">24h Change</p>
                <div className="flex items-center justify-center gap-1">
                  <TrendingUp className="h-5 w-5 text-success" />
                  <p className="font-mono text-2xl font-bold text-success">+$342.50</p>
                </div>
              </div>
              <div className="rounded-lg bg-gradient-to-br from-success/20 to-success/5 p-4 text-center">
                <p className="text-sm text-muted-foreground">All Time P&L</p>
                <div className="flex items-center justify-center gap-1">
                  <ArrowUpRight className="h-5 w-5 text-success" />
                  <p className="font-mono text-2xl font-bold text-success">+$2,450.00</p>
                </div>
              </div>
            </div>
          </Card>

          {/* Holdings */}
          <Card className="border-border bg-card p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold">Your Holdings</h3>
              <button className="flex items-center gap-1 text-sm text-primary hover:underline">
                <RefreshCw className="h-3.5 w-3.5" />
                Refresh
              </button>
            </div>
            <div className="space-y-3">
              {holdings.map((holding) => (
                <div
                  key={holding.symbol}
                  onClick={() => setSelectedCoin(holding)}
                  className="flex cursor-pointer items-center justify-between rounded-lg bg-muted/30 p-4 transition-all hover:bg-muted/50 hover:scale-[1.01]"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="flex h-10 w-10 items-center justify-center rounded-full font-mono text-xs font-bold text-white"
                      style={{ backgroundColor: holding.color }}
                    >
                      {holding.symbol.slice(0, 3)}
                    </div>
                    <div>
                      <p className="font-semibold">{holding.symbol}</p>
                      <p className="text-sm text-muted-foreground">{holding.name}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="font-mono font-semibold">
                        ${holding.value.toLocaleString("en-US", { maximumFractionDigits: 2 })}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {holding.balance.toFixed(6)} {holding.symbol}
                      </p>
                    </div>
                    <div className={`flex items-center gap-1 ${holding.change24h >= 0 ? "text-success" : "text-destructive"}`}>
                      {holding.change24h >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                      <span className="text-sm font-medium">{holding.change24h.toFixed(2)}%</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* Assets Tab */}
      {activeTab === "assets" && (
        <div className="space-y-4">
          {tradingUserLevel === 5 && !isGuestSession ? (
            <AdminOperationalAssets isGuest={isGuestSession} />
          ) : retailerCreditDesk && !isGuestSession ? (
            <RetailerOperationalAssets isGuest={isGuestSession} />
          ) : (
            <>
              {/* Sub-tabs — standard wallet */}
              <div className="flex flex-wrap gap-2">
                {[
                  { id: "send" as const, label: "Send", icon: Send },
                  { id: "receive" as const, label: "Receive", icon: Download },
                  { id: "history" as const, label: "History", icon: History },
                  { id: "approval" as const, label: "Approval", icon: ShieldCheck },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setAssetSubTab(tab.id)}
                    className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                      assetSubTab === tab.id
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    <tab.icon className="h-4 w-4" />
                    {tab.label}
                  </button>
                ))}
              </div>

          {/* Deposit */}
          {assetSubTab === "deposit" && (
            <Card className="border-border bg-card p-6">
              <h3 className="mb-4 text-lg font-semibold">Deposit Funds</h3>
              <p className="mb-4 text-sm text-muted-foreground">Choose a payment method to add funds to your account.</p>
              
              {/* Payment Method Selector */}
              <div className="mb-6 grid grid-cols-2 gap-3">
                {paymentMethods.map((method) => (
                  <button
                    key={method.id}
                    onClick={() => setPaymentMethod(method.id)}
                    className={`flex items-center gap-3 rounded-xl border-2 p-4 text-left transition-all ${
                      paymentMethod === method.id
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/50"
                    }`}
                  >
                    <div
                      className="flex h-10 w-10 items-center justify-center rounded-full"
                      style={{ backgroundColor: `${method.color}20` }}
                    >
                      <method.icon className="h-5 w-5" style={{ color: method.color }} />
                    </div>
                    <div>
                      <p className="font-medium text-sm">{method.name}</p>
                      <p className="text-xs text-muted-foreground">{method.description}</p>
                    </div>
                  </button>
                ))}
              </div>

              {/* Amount Input */}
              <div className="mb-4">
                <label className="mb-2 block text-sm font-medium text-muted-foreground">Amount (USD)</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                  <input
                    type="number"
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full rounded-lg border border-border bg-background py-3 pl-8 pr-4 font-mono text-lg outline-none transition-colors focus:border-primary"
                  />
                </div>
                <div className="mt-2 flex gap-2">
                  {[50, 100, 250, 500].map((amount) => (
                    <button
                      key={amount}
                      onClick={() => setDepositAmount(amount.toString())}
                      className="flex-1 rounded-lg bg-muted py-2 text-sm font-medium hover:bg-muted/80"
                    >
                      ${amount}
                    </button>
                  ))}
                </div>
              </div>

              {/* Payment Details */}
              {(paymentMethod === "mtn" || paymentMethod === "airtel") && (
                <div className="mb-4">
                  <label className="mb-2 block text-sm font-medium text-muted-foreground">Phone Number</label>
                  <div className="relative">
                    <Smartphone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                      type="tel"
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      placeholder="+256 7XX XXX XXX"
                      className="w-full rounded-lg border border-border bg-background py-3 pl-10 pr-4 text-sm outline-none transition-colors focus:border-primary"
                    />
                  </div>
                </div>
              )}

              {paymentMethod === "bank" && (
                <div className="mb-4 rounded-lg bg-muted/50 p-4">
                  <h4 className="mb-2 font-medium">Bank Transfer Details</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Bank Name:</span>
                      <span className="font-mono">Nexus Trading Bank</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Account Number:</span>
                      <span className="font-mono">1234567890</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">SWIFT Code:</span>
                      <span className="font-mono">NXTRUGKA</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Reference:</span>
                      <span className="font-mono text-primary">DEP-{Math.random().toString(36).slice(2, 8).toUpperCase()}</span>
                    </div>
                  </div>
                </div>
              )}

              {paymentMethod === "wallet" && (
                <div className="mb-4">
                  <label className="mb-2 block text-sm font-medium text-muted-foreground">Select Cryptocurrency</label>
                  <div className="flex flex-wrap gap-2">
                    {coins.slice(0, 4).map((coin) => (
                      <button
                        key={coin.symbol}
                        onClick={() => setSelectedCoin(coin)}
                        className={`flex items-center gap-2 rounded-lg px-3 py-2 transition-all ${
                          selectedCoin.symbol === coin.symbol
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground hover:bg-muted/80"
                        }`}
                      >
                        <div className="h-4 w-4 rounded-full" style={{ backgroundColor: coin.color }} />
                        {coin.symbol}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <button
                onClick={handleDeposit}
                disabled={!depositAmount || isProcessing}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-success py-3 font-semibold text-white transition-colors hover:bg-success/90 disabled:opacity-50"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4" />
                    Deposit ${depositAmount || "0"}
                  </>
                )}
              </button>
            </Card>
          )}

          {/* Withdraw */}
          {assetSubTab === "withdraw" && (
            <Card className="border-border bg-card p-6">
              <h3 className="mb-4 text-lg font-semibold">Withdraw Funds</h3>
              <p className="mb-4 text-sm text-muted-foreground">Select where you want to receive your funds.</p>
              
              {/* Payment Method Selector */}
              <div className="mb-6 grid grid-cols-2 gap-3">
                {paymentMethods.map((method) => (
                  <button
                    key={method.id}
                    onClick={() => setPaymentMethod(method.id)}
                    className={`flex items-center gap-3 rounded-xl border-2 p-4 text-left transition-all ${
                      paymentMethod === method.id
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/50"
                    }`}
                  >
                    <div
                      className="flex h-10 w-10 items-center justify-center rounded-full"
                      style={{ backgroundColor: `${method.color}20` }}
                    >
                      <method.icon className="h-5 w-5" style={{ color: method.color }} />
                    </div>
                    <div>
                      <p className="font-medium text-sm">{method.name}</p>
                      <p className="text-xs text-muted-foreground">{method.description}</p>
                    </div>
                  </button>
                ))}
              </div>

              {/* Amount Input */}
              <div className="mb-4">
                <label className="mb-2 block text-sm font-medium text-muted-foreground">Amount (USD)</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                  <input
                    type="number"
                    value={withdrawAmount}
                    onChange={(e) => setWithdrawAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full rounded-lg border border-border bg-background py-3 pl-8 pr-4 font-mono text-lg outline-none transition-colors focus:border-primary"
                  />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">Available balance: $24,831.42</p>
              </div>

              {/* Withdrawal Details */}
              {(paymentMethod === "mtn" || paymentMethod === "airtel") && (
                <div className="mb-4">
                  <label className="mb-2 block text-sm font-medium text-muted-foreground">Phone Number</label>
                  <div className="relative">
                    <Smartphone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                      type="tel"
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      placeholder="+256 7XX XXX XXX"
                      className="w-full rounded-lg border border-border bg-background py-3 pl-10 pr-4 text-sm outline-none transition-colors focus:border-primary"
                    />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Fee: 1.5% | Min: $10 | Max: $5,000
                  </p>
                </div>
              )}

              {paymentMethod === "bank" && (
                <div className="mb-4 space-y-3">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-muted-foreground">Bank Account Number</label>
                    <div className="relative">
                      <Building2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <input
                        type="text"
                        value={bankAccount}
                        onChange={(e) => setBankAccount(e.target.value)}
                        placeholder="Enter account number"
                        className="w-full rounded-lg border border-border bg-background py-3 pl-10 pr-4 text-sm outline-none transition-colors focus:border-primary"
                      />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Fee: $5 flat | Processing: 1-3 business days
                  </p>
                </div>
              )}

              {paymentMethod === "wallet" && (
                <div className="mb-4 space-y-3">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-muted-foreground">Select Cryptocurrency</label>
                    <div className="flex flex-wrap gap-2">
                      {coins.slice(0, 4).map((coin) => (
                        <button
                          key={coin.symbol}
                          onClick={() => setSelectedCoin(coin)}
                          className={`flex items-center gap-2 rounded-lg px-3 py-2 transition-all ${
                            selectedCoin.symbol === coin.symbol
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted text-muted-foreground hover:bg-muted/80"
                          }`}
                        >
                          <div className="h-4 w-4 rounded-full" style={{ backgroundColor: coin.color }} />
                          {coin.symbol}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-muted-foreground">Wallet Address</label>
                    <input
                      type="text"
                      value={walletAddress}
                      onChange={(e) => setWalletAddress(e.target.value)}
                      placeholder={`Enter ${selectedCoin.symbol} wallet address`}
                      className="w-full rounded-lg border border-border bg-background py-3 px-4 font-mono text-sm outline-none transition-colors focus:border-primary"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Network fee: ~0.0001 {selectedCoin.symbol}
                  </p>
                </div>
              )}

              <button
                onClick={handleWithdraw}
                disabled={!withdrawAmount || isProcessing}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-destructive py-3 font-semibold text-white transition-colors hover:bg-destructive/90 disabled:opacity-50"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Minus className="h-4 w-4" />
                    Withdraw ${withdrawAmount || "0"}
                  </>
                )}
              </button>
            </Card>
          )}

          {/* Send */}
          {assetSubTab === "send" && (
            <Card className="border-border bg-card p-6">
              <h3 className="mb-4 text-lg font-semibold">Send Crypto</h3>
              
              {/* Coin Selector */}
              <div className="mb-4">
                <label className="mb-2 block text-sm font-medium text-muted-foreground">Select Coin</label>
                <div className="flex flex-wrap gap-2">
                  {coins.slice(0, 6).map((coin) => (
                    <button
                      key={coin.symbol}
                      onClick={() => setSelectedCoin(coin)}
                      className={`flex items-center gap-2 rounded-lg px-3 py-2 transition-all ${
                        selectedCoin.symbol === coin.symbol
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground hover:bg-muted/80"
                      }`}
                    >
                      <div
                        className="h-5 w-5 rounded-full"
                        style={{ backgroundColor: coin.color }}
                      />
                      {coin.symbol}
                    </button>
                  ))}
                </div>
              </div>

              {/* Recipient Address */}
              <div className="mb-4">
                <label className="mb-2 block text-sm font-medium text-muted-foreground">Recipient Address</label>
                <input
                  type="text"
                  value={recipientAddress}
                  onChange={(e) => setRecipientAddress(e.target.value)}
                  placeholder="Enter wallet address"
                  className="w-full rounded-lg border border-border bg-background px-4 py-3 text-sm outline-none transition-colors focus:border-primary"
                />
              </div>

              {/* Amount */}
              <div className="mb-4">
                <label className="mb-2 block text-sm font-medium text-muted-foreground">Amount</label>
                <div className="relative">
                  <input
                    type="number"
                    value={sendAmount}
                    onChange={(e) => setSendAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full rounded-lg border border-border bg-background px-4 py-3 pr-20 font-mono text-sm outline-none transition-colors focus:border-primary"
                  />
                  <button
                    onClick={() => setSendAmount("10")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded bg-primary/10 px-2 py-1 text-xs font-semibold text-primary"
                  >
                    MAX
                  </button>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Network Fee: ~0.0001 {selectedCoin.symbol}
                </p>
              </div>

              <button
                onClick={handleSend}
                disabled={!sendAmount || !recipientAddress}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-3 font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
                Send {selectedCoin.symbol}
              </button>
            </Card>
          )}

          {/* Receive */}
          {assetSubTab === "receive" && (
            <Card className="border-border bg-card p-6">
              <h3 className="mb-4 text-lg font-semibold">Receive Crypto</h3>
              
              {/* Coin Selector */}
              <div className="mb-4">
                <label className="mb-2 block text-sm font-medium text-muted-foreground">Select Coin</label>
                <div className="flex flex-wrap gap-2">
                  {coins.slice(0, 6).map((coin) => (
                    <button
                      key={coin.symbol}
                      onClick={() => setSelectedCoin(coin)}
                      className={`flex items-center gap-2 rounded-lg px-3 py-2 transition-all ${
                        selectedCoin.symbol === coin.symbol
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground hover:bg-muted/80"
                      }`}
                    >
                      <div
                        className="h-5 w-5 rounded-full"
                        style={{ backgroundColor: coin.color }}
                      />
                      {coin.symbol}
                    </button>
                  ))}
                </div>
              </div>

              {/* QR Code */}
              <div className="mb-4 flex justify-center">
                <div className="flex h-48 w-48 items-center justify-center rounded-xl border-2 border-dashed border-border bg-muted/30">
                  <QrCode className="h-32 w-32 text-muted-foreground" />
                </div>
              </div>

              {/* Address */}
              <div className="rounded-lg bg-muted/30 p-4">
                <p className="mb-2 text-center text-xs text-muted-foreground">Your {selectedCoin.symbol} Deposit Address</p>
                <div className="flex items-center justify-between gap-2 rounded-lg bg-background p-3">
                  <code className="flex-1 truncate font-mono text-sm">
                    0x742d35Cc6634C0532925a3b844Bc9e7595f8fE21
                  </code>
                  <button
                    onClick={handleCopyAddress}
                    className="flex-shrink-0 rounded-lg bg-primary/10 p-2 text-primary transition-colors hover:bg-primary/20"
                  >
                    {copiedAddress ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </Card>
          )}

          {/* History */}
          {assetSubTab === "history" && (
            <Card className="border-border bg-card p-6">
              <h3 className="mb-4 text-lg font-semibold">Transaction History</h3>
              <div className="space-y-3">
                {transactions.map((tx) => (
                  <div
                    key={tx.id}
                    className="flex items-center justify-between rounded-lg bg-muted/30 p-4 transition-all hover:bg-muted/50"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`flex h-10 w-10 items-center justify-center rounded-full ${
                        tx.type === "receive" ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"
                      }`}>
                        {tx.type === "receive" ? <ArrowDownRight className="h-5 w-5" /> : <ArrowUpRight className="h-5 w-5" />}
                      </div>
                      <div>
                        <p className="font-medium capitalize">{tx.type} {tx.coin}</p>
                        <p className="text-xs text-muted-foreground">
                          {tx.type === "receive" ? `From: ${tx.from}` : `To: ${tx.to}`}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`font-mono font-semibold ${tx.type === "receive" ? "text-success" : "text-destructive"}`}>
                        {tx.type === "receive" ? "+" : "-"}{tx.amount} {tx.coin}
                      </p>
                      <div className="flex items-center justify-end gap-1 text-xs">
                        {tx.status === "completed" && <CheckCircle2 className="h-3 w-3 text-success" />}
                        {tx.status === "pending" && <Clock className="h-3 w-3 text-warning" />}
                        {tx.status === "failed" && <XCircle className="h-3 w-3 text-destructive" />}
                        <span className="text-muted-foreground">{tx.time}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Approvals */}
          {assetSubTab === "approval" && (
            <Card className="border-border bg-card p-6">
              <h3 className="mb-4 text-lg font-semibold">Pending Approvals</h3>
              <div className="space-y-3">
                {approvals.map((approval) => (
                  <div
                    key={approval.id}
                    className="flex items-center justify-between rounded-lg bg-muted/30 p-4"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-warning/10 text-warning">
                        {approval.type === "withdrawal" && <Send className="h-5 w-5" />}
                        {approval.type === "device" && <Lock className="h-5 w-5" />}
                        {approval.type === "api_key" && <ShieldCheck className="h-5 w-5" />}
                      </div>
                      <div>
                        <p className="font-medium capitalize">{approval.type.replace("_", " ")}</p>
                        <p className="text-xs text-muted-foreground">
                          {approval.type === "withdrawal" && `${approval.amount} ${approval.coin}`}
                          {approval.type === "device" && `${approval.device} - ${approval.location}`}
                          {approval.type === "api_key" && `${approval.name}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button className="rounded-lg bg-success/10 px-3 py-1.5 text-xs font-semibold text-success transition-colors hover:bg-success/20">
                        Approve
                      </button>
                      <button className="rounded-lg bg-destructive/10 px-3 py-1.5 text-xs font-semibold text-destructive transition-colors hover:bg-destructive/20">
                        Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
            </>
          )}
        </div>
      )}

      {/* Earn Tab */}
      {activeTab === "earn" && (
        <div className="space-y-4">
          {/* Header */}
          <Card className="border-border bg-card p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-primary/5">
                <Sparkles className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">Earn Rewards</h2>
                <p className="text-sm text-muted-foreground">
                  Stake your crypto and earn passive income with competitive APY rates.
                </p>
              </div>
            </div>

            {/* Filters */}
            <div className="mt-4 flex gap-2">
              {(["all", "flexible", "fixed"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setEarnFilter(f)}
                  className={`rounded-lg px-4 py-2 text-sm font-medium capitalize transition-colors ${
                    earnFilter === f
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </Card>

          {/* Earn Options */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredEarnOptions.map((opt) => (
              <Card
                key={opt.coin}
                className="border-border bg-card p-5 transition-all hover:border-primary/40 hover:scale-[1.02]"
              >
                {opt.isPromo && (
                  <span className="mb-2 inline-flex items-center gap-1 rounded-full bg-warning/10 px-2 py-0.5 text-xs font-semibold text-warning">
                    <Sparkles className="h-3 w-3" />
                    Limited Time Promo
                  </span>
                )}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 font-mono text-sm font-bold text-primary">
                      {opt.coin.slice(0, 3)}
                    </div>
                    <div>
                      <p className="font-semibold">{opt.coin}</p>
                      <p className="text-xs text-muted-foreground">{opt.term}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-2xl font-bold text-success">
                      {opt.apy}%
                    </p>
                    <p className="text-xs text-muted-foreground">APY</p>
                  </div>
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  Min: {opt.minAmount} {opt.coin}
                </p>
                <button
                  onClick={() => handleSubscribe(opt.coin)}
                  disabled={subscribingCoin === opt.coin}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-70"
                >
                  {subscribingCoin === opt.coin ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      Subscribing...
                    </>
                  ) : (
                    <>
                      Subscribe
                      <ChevronRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
