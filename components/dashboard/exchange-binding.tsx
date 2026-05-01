"use client"

import { useState, useEffect } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Link2,
  Unlink,
  Check,
  X,
  Eye,
  EyeOff,
  RefreshCw,
  AlertTriangle,
  Shield,
  Wallet,
  ChevronRight,
  ChevronDown,
  Copy,
  ExternalLink,
  Loader2,
  Snowflake,
  Flame,
  Activity,
} from "lucide-react"
import { useExchangeBalances, type ConnectedExchange } from "@/hooks/use-exchange-balances"

interface ExchangeBindingProps {
  onSelectExchange?: (exchange: ConnectedExchange) => void
  selectedExchangeId?: string
}

const SUPPORTED_EXCHANGES: { id: string; name: string; logo: string; color: string }[] = [
  { id: "binance", name: "Binance", logo: "B", color: "from-yellow-500 to-yellow-600" },
  { id: "bybit", name: "Bybit", logo: "BY", color: "from-orange-500 to-orange-600" },
  { id: "bitget", name: "Bitget", logo: "BG", color: "from-cyan-500 to-cyan-600" },
  { id: "kucoin", name: "KuCoin", logo: "KC", color: "from-green-500 to-green-600" },
  { id: "blofin", name: "Blofin", logo: "BF", color: "from-purple-500 to-purple-600" },
  { id: "okx", name: "OKX", logo: "OK", color: "from-white to-gray-300" },
  { id: "mexc", name: "MEXC", logo: "MX", color: "from-blue-500 to-blue-600" },
  { id: "gateio", name: "Gate.io", logo: "GT", color: "from-blue-400 to-blue-500" },
]

export function ExchangeBinding({ onSelectExchange, selectedExchangeId }: ExchangeBindingProps) {
  const {
    exchanges,
    balanceState,
    toggleFreeze,
    connectExchange,
    disconnectExchange,
    setDefaultExchange,
  } = useExchangeBalances()

  const [showBindModal, setShowBindModal] = useState(false)
  const [selectedForBinding, setSelectedForBinding] = useState<string | null>(null)
  const [apiKey, setApiKey] = useState("")
  const [apiSecret, setApiSecret] = useState("")
  const [apiPassphrase, setApiPassphrase] = useState("")
  const [showSecret, setShowSecret] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [expandedExchange, setExpandedExchange] = useState<string | null>(null)

  const connectedExchanges = exchanges.filter(ex => ex.apiKey && ex.apiSecret)
  const availableExchanges = SUPPORTED_EXCHANGES.filter(
    ex => !connectedExchanges.find(ce => ce.id === ex.id)
  )
  const totalBalance = balanceState.totalUsd

  const handleConnect = async () => {
    if (!selectedForBinding || !apiKey || !apiSecret) return
    
    setIsConnecting(true)
    
    const exchange = SUPPORTED_EXCHANGES.find(e => e.id === selectedForBinding)
    if (exchange) {
      connectExchange(exchange.id, exchange.name, apiKey, apiSecret, apiPassphrase || undefined)
    }
    
    setIsConnecting(false)
    setShowBindModal(false)
    setApiKey("")
    setApiSecret("")
    setApiPassphrase("")
    setSelectedForBinding(null)
  }

  const handleDisconnect = (exchangeId: string) => {
    disconnectExchange(exchangeId)
  }

  const handleSetDefault = (exchangeId: string) => {
    setDefaultExchange(exchangeId)
  }

  return (
    <div className="space-y-4">
      {/* Total Balance Card */}
      <Card className="border-primary/30 bg-gradient-to-br from-primary/10 to-accent/10 p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground">Total Connected Balance</p>
            <p className="text-2xl font-bold">
              ${totalBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Wallet className="h-8 w-8 text-primary" />
          </div>
        </div>
        <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
          <Shield className="h-3 w-3" />
          <span>{connectedExchanges.length} exchange{connectedExchanges.length !== 1 ? "s" : ""} connected</span>
          {balanceState.isPolling && (
            <>
              <Activity className="h-3 w-3 ml-2 text-success animate-pulse" />
              <span className="text-success">Live</span>
            </>
          )}
        </div>
      </Card>

      {/* Connected Exchanges */}
      {connectedExchanges.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Connected Exchanges</h3>
          {connectedExchanges.map((exchange) => {
            const exchangeInfo = SUPPORTED_EXCHANGES.find(e => e.id === exchange.id)
            return (
              <Card 
                key={exchange.id}
                className={`border-border bg-card p-3 cursor-pointer transition-all ${
                  selectedExchangeId === exchange.id ? "ring-2 ring-primary" : ""
                } ${exchange.isDefault ? "border-primary/50" : ""} ${
                  exchange.frozen ? "opacity-60" : ""
                }`}
                onClick={() => onSelectExchange?.(exchange)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br ${exchangeInfo?.color || "from-primary to-accent"} text-sm font-bold text-white`}>
                      {exchangeInfo?.logo || exchange.name.slice(0, 2)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-semibold">{exchange.name}</p>
                        {exchange.isDefault && (
                          <span className="rounded bg-primary/20 px-1.5 py-0.5 text-[10px] font-semibold text-primary">DEFAULT</span>
                        )}
                        {exchange.frozen && (
                          <span className="rounded bg-blue-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-blue-400 flex items-center gap-1">
                            <Snowflake className="h-2.5 w-2.5" />
                            FROZEN
                          </span>
                        )}
                      </div>
                      <p className="text-lg font-bold text-success">
                        ${(exchange.balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                  </div>
                  <button 
                    onClick={(e) => { e.stopPropagation(); setExpandedExchange(expandedExchange === exchange.id ? null : exchange.id) }}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <ChevronDown className={`h-5 w-5 transition-transform ${expandedExchange === exchange.id ? "rotate-180" : ""}`} />
                  </button>
                </div>

                {/* Expanded Options */}
                {expandedExchange === exchange.id && (
                  <div className="mt-3 space-y-2 border-t border-border pt-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">API Key</span>
                      <span className="font-mono">
                        {exchange.apiKey ? exchange.apiKey.slice(0, 8) + "..." + exchange.apiKey.slice(-4) : "N/A"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Last Sync</span>
                      <span>{exchange.lastSync ? new Date(exchange.lastSync).toLocaleString() : "Never"}</span>
                    </div>
                    <div className="flex gap-2 pt-2">
                      {/* Freeze/Unfreeze Toggle */}
                      <Button 
                        variant={exchange.frozen ? "default" : "outline"}
                        size="sm"
                        className={`flex-1 ${exchange.frozen ? "bg-blue-600 hover:bg-blue-700" : ""}`}
                        onClick={(e) => { e.stopPropagation(); toggleFreeze(exchange.id) }}
                      >
                        {exchange.frozen ? (
                          <>
                            <Flame className="h-4 w-4 mr-1" />
                            Unfreeze
                          </>
                        ) : (
                          <>
                            <Snowflake className="h-4 w-4 mr-1" />
                            Freeze
                          </>
                        )}
                      </Button>
                      {!exchange.isDefault && (
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={(e) => { e.stopPropagation(); handleSetDefault(exchange.id) }}
                        >
                          Set Default
                        </Button>
                      )}
                      <Button 
                        variant="destructive" 
                        size="sm"
                        onClick={(e) => { e.stopPropagation(); handleDisconnect(exchange.id) }}
                      >
                        <Unlink className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}

      {/* Available Exchanges */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Connect New Exchange</h3>
        <div className="grid grid-cols-2 gap-2">
          {availableExchanges.map((exchange) => (
            <button
              key={exchange.id}
              onClick={() => { setSelectedForBinding(exchange.id); setShowBindModal(true) }}
              className="flex items-center gap-2 rounded-lg border border-border bg-card p-3 transition-colors hover:border-primary/50 hover:bg-muted/50"
            >
              <div className={`flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br ${exchange.color} text-xs font-bold text-white`}>
                {exchange.logo}
              </div>
              <span className="text-sm font-medium">{exchange.name}</span>
              <Link2 className="ml-auto h-4 w-4 text-muted-foreground" />
            </button>
          ))}
        </div>
      </div>

      {/* Bind Modal */}
      {showBindModal && selectedForBinding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Connect {SUPPORTED_EXCHANGES.find(e => e.id === selectedForBinding)?.name}</h3>
              <button onClick={() => setShowBindModal(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="rounded-lg bg-warning/10 border border-warning/30 p-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-warning mt-0.5" />
                  <div className="text-xs text-warning">
                    <p className="font-semibold">Important Security Notice</p>
                    <p>Only use API keys with trading permissions. Never share your secret key with anyone.</p>
                  </div>
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium">API Key</label>
                <Input
                  type="text"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Enter your API key"
                  className="font-mono text-sm"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium">API Secret</label>
                <div className="relative">
                  <Input
                    type={showSecret ? "text" : "password"}
                    value={apiSecret}
                    onChange={(e) => setApiSecret(e.target.value)}
                    placeholder="Enter your API secret"
                    className="font-mono text-sm pr-10"
                  />
                  <button 
                    onClick={() => setShowSecret(!showSecret)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium">API Passphrase (optional)</label>
                <Input
                  type="text"
                  value={apiPassphrase}
                  onChange={(e) => setApiPassphrase(e.target.value)}
                  placeholder="Required for some exchanges like Bitget"
                  className="font-mono text-sm"
                />
              </div>

              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <ExternalLink className="h-3 w-3" />
                <a href="#" className="hover:text-primary">How to create API keys?</a>
              </div>

              <div className="flex gap-2 pt-2">
                <Button variant="outline" className="flex-1" onClick={() => setShowBindModal(false)}>
                  Cancel
                </Button>
                <Button 
                  className="flex-1" 
                  onClick={handleConnect}
                  disabled={!apiKey || !apiSecret || isConnecting}
                >
                  {isConnecting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Connecting...
                    </>
                  ) : (
                    <>
                      <Link2 className="h-4 w-4 mr-2" />
                      Connect
                    </>
                  )}
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
