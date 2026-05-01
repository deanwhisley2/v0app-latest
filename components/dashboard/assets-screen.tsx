"use client"

import { useState } from "react"
import {
  ArrowUpRight,
  ArrowDownLeft,
  Clock,
  CheckCircle2,
  X,
  Copy,
  QrCode,
  Search,
  ChevronRight,
  AlertCircle,
  CheckCheck,
  XCircle,
  Loader2,
} from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

type AssetTab = "send" | "receive" | "history" | "approval"

interface Transaction {
  id: string
  type: "send" | "receive"
  coin: string
  amount: number
  address: string
  status: "completed" | "pending" | "failed"
  date: string
  txHash: string
}

interface Approval {
  id: string
  type: string
  description: string
  date: string
  status: "pending" | "approved" | "rejected"
}

const mockTransactions: Transaction[] = [
  { id: "1", type: "send", coin: "BTC", amount: 0.125, address: "bc1q...x8f2", status: "completed", date: "2024-01-15 14:32", txHash: "0x1a2b3c..." },
  { id: "2", type: "receive", coin: "ETH", amount: 2.5, address: "0x71C...9aE2", status: "completed", date: "2024-01-14 09:15", txHash: "0x4d5e6f..." },
  { id: "3", type: "send", coin: "USDT", amount: 500, address: "TRx...Pq7M", status: "pending", date: "2024-01-14 08:45", txHash: "0x7g8h9i..." },
  { id: "4", type: "receive", coin: "SOL", amount: 15.8, address: "7xK...mN3p", status: "completed", date: "2024-01-13 16:20", txHash: "0xj1k2l3..." },
  { id: "5", type: "send", coin: "BNB", amount: 1.2, address: "bnb1...r5t6", status: "failed", date: "2024-01-12 11:00", txHash: "0xm4n5o6..." },
]

const mockApprovals: Approval[] = [
  { id: "1", type: "Withdrawal", description: "BTC withdrawal request - 0.5 BTC", date: "2024-01-15 10:00", status: "pending" },
  { id: "2", type: "Device", description: "New device login from Chrome on Windows", date: "2024-01-14 15:30", status: "pending" },
  { id: "3", type: "API Key", description: "Trading API key creation request", date: "2024-01-13 09:00", status: "approved" },
  { id: "4", type: "Whitelist", description: "Add address to whitelist: bc1q...x8f2", date: "2024-01-12 14:20", status: "rejected" },
]

interface AssetCoin {
  symbol: string
  name: string
  balance: number
  color: string
}

interface AssetsScreenProps {
  coins: Array<{ symbol: string; name: string; color: string }>
}

export function AssetsScreen({ coins: propCoins }: AssetsScreenProps) {
  // Add balance to coins
  const coins: AssetCoin[] = propCoins.slice(0, 8).map((coin) => ({
    ...coin,
    balance: Math.random() * 10,
  }))
  const [activeTab, setActiveTab] = useState<AssetTab>("send")
  const [selectedCoin, setSelectedCoin] = useState<AssetCoin>(coins[0] || { symbol: "BTC", name: "Bitcoin", balance: 0, color: "#F7931A" })
  const [amount, setAmount] = useState("")
  const [address, setAddress] = useState("")
  const [showCoinSelect, setShowCoinSelect] = useState(false)
  const [copied, setCopied] = useState(false)

  const tabs: { key: AssetTab; label: string; icon: React.ReactNode }[] = [
    { key: "send", label: "Send", icon: <ArrowUpRight className="h-4 w-4" /> },
    { key: "receive", label: "Receive", icon: <ArrowDownLeft className="h-4 w-4" /> },
    { key: "history", label: "History", icon: <Clock className="h-4 w-4" /> },
    { key: "approval", label: "Approval", icon: <CheckCircle2 className="h-4 w-4" /> },
  ]

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const depositAddress = "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh"

  return (
    <div className="space-y-4">
      {/* Tab Navigation */}
      <Card className="border-border bg-card p-2">
        <div className="flex gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-medium transition-all ${
                activeTab === tab.key
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      </Card>

      {/* Send Tab */}
      {activeTab === "send" && (
        <Card className="border-border bg-card p-6">
          <h3 className="mb-6 text-lg font-semibold">Send Crypto</h3>
          
          {/* Coin Selector */}
          <div className="mb-4">
            <label className="mb-2 block text-sm text-muted-foreground">Select Coin</label>
            <button
              onClick={() => setShowCoinSelect(!showCoinSelect)}
              className="flex w-full items-center justify-between rounded-lg border border-border bg-muted/30 px-4 py-3 transition-colors hover:border-primary/40"
            >
              <div className="flex items-center gap-3">
                <div
                  className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white"
                  style={{ backgroundColor: selectedCoin.color }}
                >
                  {selectedCoin.symbol.slice(0, 3)}
                </div>
                <div className="text-left">
                  <p className="font-semibold">{selectedCoin.symbol}</p>
                  <p className="text-xs text-muted-foreground">Balance: {selectedCoin.balance}</p>
                </div>
              </div>
              <ChevronRight className={`h-4 w-4 transition-transform ${showCoinSelect ? "rotate-90" : ""}`} />
            </button>

            {showCoinSelect && (
              <div className="mt-2 rounded-lg border border-border bg-background p-2">
                {coins.map((coin) => (
                  <button
                    key={coin.symbol}
                    onClick={() => {
                      setSelectedCoin(coin)
                      setShowCoinSelect(false)
                    }}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-muted"
                  >
                    <div
                      className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white"
                      style={{ backgroundColor: coin.color }}
                    >
                      {coin.symbol.slice(0, 3)}
                    </div>
                    <div className="text-left">
                      <p className="font-medium">{coin.symbol}</p>
                      <p className="text-xs text-muted-foreground">{coin.name}</p>
                    </div>
                    <p className="ml-auto font-mono text-sm">{coin.balance}</p>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Address Input */}
          <div className="mb-4">
            <label className="mb-2 block text-sm text-muted-foreground">Recipient Address</label>
            <div className="relative">
              <Input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Enter wallet address"
                className="bg-muted/30 pr-10"
              />
              <button className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <QrCode className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Amount Input */}
          <div className="mb-6">
            <label className="mb-2 block text-sm text-muted-foreground">Amount</label>
            <div className="relative">
              <Input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="bg-muted/30 pr-20 font-mono"
              />
              <button
                onClick={() => setAmount(selectedCoin.balance.toString())}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary hover:bg-primary/20"
              >
                MAX
              </button>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Available: {selectedCoin.balance} {selectedCoin.symbol}
            </p>
          </div>

          {/* Network Fee */}
          <div className="mb-6 rounded-lg bg-muted/30 p-4">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Network Fee</span>
              <span className="font-mono">~0.0001 {selectedCoin.symbol}</span>
            </div>
            <div className="mt-2 flex justify-between text-sm">
              <span className="text-muted-foreground">You will send</span>
              <span className="font-mono font-semibold">
                {amount || "0.00"} {selectedCoin.symbol}
              </span>
            </div>
          </div>

          <Button className="w-full" size="lg">
            <ArrowUpRight className="mr-2 h-4 w-4" />
            Send {selectedCoin.symbol}
          </Button>
        </Card>
      )}

      {/* Receive Tab */}
      {activeTab === "receive" && (
        <Card className="border-border bg-card p-6">
          <h3 className="mb-6 text-lg font-semibold">Receive Crypto</h3>
          
          {/* Coin Selector */}
          <div className="mb-6">
            <label className="mb-2 block text-sm text-muted-foreground">Select Coin</label>
            <div className="flex flex-wrap gap-2">
              {coins.map((coin) => (
                <button
                  key={coin.symbol}
                  onClick={() => setSelectedCoin(coin)}
                  className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-all ${
                    selectedCoin.symbol === coin.symbol
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:border-primary/40"
                  }`}
                >
                  <div
                    className="h-4 w-4 rounded-full"
                    style={{ backgroundColor: coin.color }}
                  />
                  {coin.symbol}
                </button>
              ))}
            </div>
          </div>

          {/* QR Code */}
          <div className="mb-6 flex flex-col items-center">
            <div className="mb-4 rounded-xl border border-border bg-white p-4">
              <div className="flex h-48 w-48 items-center justify-center">
                <QrCode className="h-32 w-32 text-gray-800" />
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              Scan to get {selectedCoin.symbol} address
            </p>
          </div>

          {/* Address */}
          <div className="rounded-lg bg-muted/30 p-4">
            <p className="mb-2 text-xs text-muted-foreground">Your {selectedCoin.symbol} Deposit Address</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 break-all font-mono text-sm">{depositAddress}</code>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleCopy(depositAddress)}
                className="shrink-0"
              >
                {copied ? <CheckCheck className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          <div className="mt-4 flex items-start gap-2 rounded-lg bg-warning/10 p-3 text-sm text-warning">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>Only send {selectedCoin.symbol} to this address. Sending other coins may result in permanent loss.</p>
          </div>
        </Card>
      )}

      {/* History Tab */}
      {activeTab === "history" && (
        <Card className="border-border bg-card p-6">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-semibold">Transaction History</h3>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Search..." className="w-48 bg-muted/30 pl-9" />
            </div>
          </div>

          <div className="space-y-3">
            {mockTransactions.map((tx) => (
              <div
                key={tx.id}
                className="flex items-center justify-between rounded-lg bg-muted/30 p-4 transition-colors hover:bg-muted/50"
              >
                <div className="flex items-center gap-3">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-full ${
                    tx.type === "send" ? "bg-destructive/10" : "bg-success/10"
                  }`}>
                    {tx.type === "send" ? (
                      <ArrowUpRight className={`h-5 w-5 text-destructive`} />
                    ) : (
                      <ArrowDownLeft className={`h-5 w-5 text-success`} />
                    )}
                  </div>
                  <div>
                    <p className="font-semibold">
                      {tx.type === "send" ? "Sent" : "Received"} {tx.coin}
                    </p>
                    <p className="text-xs text-muted-foreground">{tx.date}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`font-mono font-semibold ${tx.type === "send" ? "text-destructive" : "text-success"}`}>
                    {tx.type === "send" ? "-" : "+"}{tx.amount} {tx.coin}
                  </p>
                  <span className={`inline-flex items-center gap-1 text-xs ${
                    tx.status === "completed" ? "text-success" :
                    tx.status === "pending" ? "text-warning" : "text-destructive"
                  }`}>
                    {tx.status === "completed" && <CheckCircle2 className="h-3 w-3" />}
                    {tx.status === "pending" && <Loader2 className="h-3 w-3 animate-spin" />}
                    {tx.status === "failed" && <XCircle className="h-3 w-3" />}
                    {tx.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Approval Tab */}
      {activeTab === "approval" && (
        <Card className="border-border bg-card p-6">
          <h3 className="mb-4 text-lg font-semibold">Pending Approvals</h3>
          <p className="mb-6 text-sm text-muted-foreground">
            Review and manage pending security approvals and authorization requests.
          </p>

          <div className="space-y-3">
            {mockApprovals.map((approval) => (
              <div
                key={approval.id}
                className="rounded-lg border border-border bg-muted/20 p-4"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="mb-1 flex items-center gap-2">
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                        {approval.type}
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                        approval.status === "pending" ? "bg-warning/10 text-warning" :
                        approval.status === "approved" ? "bg-success/10 text-success" :
                        "bg-destructive/10 text-destructive"
                      }`}>
                        {approval.status}
                      </span>
                    </div>
                    <p className="font-medium">{approval.description}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{approval.date}</p>
                  </div>
                  {approval.status === "pending" && (
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" className="h-8 border-destructive/40 text-destructive hover:bg-destructive/10">
                        <X className="mr-1 h-3 w-3" />
                        Reject
                      </Button>
                      <Button size="sm" className="h-8">
                        <CheckCircle2 className="mr-1 h-3 w-3" />
                        Approve
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}
