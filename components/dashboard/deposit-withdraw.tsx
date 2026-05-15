"use client"

import { useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  ArrowDownLeft,
  ArrowUpRight,
  CreditCard,
  Building2,
  Smartphone,
  Wallet,
  DollarSign,
  Check,
  X,
  AlertTriangle,
  Shield,
  Lock,
  Upload,
  FileImage,
  ChevronRight,
  Copy,
  QrCode,
  Loader2,
  Info,
  Key,
} from "lucide-react"

type TransactionType = "deposit" | "withdraw"
type DepositMethod = "bank" | "card" | "mobile" | "crypto"
type WithdrawMethod = "bank" | "mobile" | "crypto"

interface DepositWithdrawProps {
  securityLevel: 1 | 2 | 3
  balance: number
  /** When false, hides the large balance banner (balances live on Dashboard). */
  showBalanceBanner?: boolean
  onTransaction: (type: TransactionType, amount: number, method: string) => void
  onRequireSecurityUpgrade: () => void
}

export function DepositWithdraw({ 
  securityLevel, 
  balance,
  showBalanceBanner = true,
  onTransaction,
  onRequireSecurityUpgrade 
}: DepositWithdrawProps) {
  const [activeTab, setActiveTab] = useState<TransactionType>("deposit")
  const [amount, setAmount] = useState("")
  const [depositMethod, setDepositMethod] = useState<DepositMethod>("bank")
  const [withdrawMethod, setWithdrawMethod] = useState<WithdrawMethod>("bank")
  const [step, setStep] = useState(1)
  const [isLoading, setIsLoading] = useState(false)
  
  // Deposit-specific
  const [idPhoto, setIdPhoto] = useState<string | null>(null)
  const [accountName, setAccountName] = useState("")
  const [accountNumber, setAccountNumber] = useState("")
  
  // Withdraw-specific
  const [withdrawPin, setWithdrawPin] = useState("")
  const [withdrawAddress, setWithdrawAddress] = useState("")
  const [withdrawAccountName, setWithdrawAccountName] = useState("")

  const depositMethods = [
    { id: "bank" as const, name: "Bank Transfer", icon: Building2, minLevel: 2 },
    { id: "card" as const, name: "Debit/Credit Card", icon: CreditCard, minLevel: 2 },
    { id: "mobile" as const, name: "Mobile Money", icon: Smartphone, minLevel: 2 },
    { id: "crypto" as const, name: "Crypto Wallet", icon: Wallet, minLevel: 1 },
  ]

  const withdrawMethods = [
    { id: "bank" as const, name: "Bank Account", icon: Building2, minLevel: 3 },
    { id: "mobile" as const, name: "Mobile Money", icon: Smartphone, minLevel: 3 },
    { id: "crypto" as const, name: "Crypto Wallet", icon: Wallet, minLevel: 3 },
  ]

  const presetAmounts = [100, 250, 500, 1000]

  const handleDeposit = () => {
    if (!amount || parseFloat(amount) <= 0) return
    setIsLoading(true)
    setTimeout(() => {
      onTransaction("deposit", parseFloat(amount), depositMethod)
      setIsLoading(false)
      setStep(1)
      setAmount("")
      setIdPhoto(null)
    }, 2000)
  }

  const handleWithdraw = () => {
    if (!amount || parseFloat(amount) <= 0 || withdrawPin.length !== 6) return
    setIsLoading(true)
    setTimeout(() => {
      onTransaction("withdraw", parseFloat(amount), withdrawMethod)
      setIsLoading(false)
      setStep(1)
      setAmount("")
      setWithdrawPin("")
    }, 2000)
  }

  const renderDepositContent = () => {
    if (securityLevel < 2 && depositMethod !== "crypto") {
      return (
        <Card className="border-warning/30 bg-warning/5 p-6 text-center">
          <Shield className="mx-auto h-12 w-12 text-warning mb-3" />
          <h4 className="font-semibold text-warning">Security Level 2 Required</h4>
          <p className="text-sm text-muted-foreground mt-1 mb-4">
            External deposits require Level 2 security to protect against fraud.
          </p>
          <Button onClick={onRequireSecurityUpgrade}>
            Upgrade Security <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </Card>
      )
    }

    return (
      <div className="space-y-4">
        {/* Amount Input */}
        <div>
          <label className="text-xs font-medium text-muted-foreground">Amount (USD)</label>
          <div className="relative mt-1">
            <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="pl-10 text-xl font-bold h-14"
            />
          </div>
          <div className="flex gap-2 mt-2">
            {presetAmounts.map((preset) => (
              <button
                key={preset}
                onClick={() => setAmount(preset.toString())}
                className="flex-1 rounded-lg bg-muted py-2 text-sm font-medium hover:bg-muted/80"
              >
                ${preset}
              </button>
            ))}
          </div>
        </div>

        {/* Deposit Methods */}
        <div>
          <label className="text-xs font-medium text-muted-foreground">Deposit Method</label>
          <div className="grid grid-cols-2 gap-2 mt-2">
            {depositMethods.map((method) => {
              const locked = securityLevel < method.minLevel
              return (
                <button
                  key={method.id}
                  onClick={() => !locked && setDepositMethod(method.id)}
                  disabled={locked}
                  className={`flex items-center gap-2 rounded-lg border p-3 transition-all ${
                    depositMethod === method.id
                      ? "border-primary bg-primary/10"
                      : locked
                      ? "border-border opacity-50"
                      : "border-border hover:border-primary/50"
                  }`}
                >
                  <method.icon className="h-5 w-5" />
                  <div className="text-left">
                    <p className="text-sm font-medium">{method.name}</p>
                    {locked && (
                      <p className="text-[10px] text-muted-foreground">Level {method.minLevel}+</p>
                    )}
                  </div>
                  {locked && <Lock className="h-4 w-4 ml-auto text-muted-foreground" />}
                </button>
              )
            })}
          </div>
        </div>

        {/* ID Verification for External Deposits */}
        {depositMethod !== "crypto" && (
          <Card className="border-warning/30 bg-warning/5 p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-warning mt-0.5" />
              <div className="flex-1">
                <h4 className="text-sm font-semibold text-warning">ID Verification Required</h4>
                <p className="text-xs text-muted-foreground mt-1">
                  To prevent fraud, please provide a photo of the ID/passport of the account owner making this deposit.
                </p>
                
                <div className="mt-3">
                  {idPhoto ? (
                    <div className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-success" />
                      <span className="text-sm text-success">ID Photo uploaded</span>
                      <button
                        onClick={() => setIdPhoto(null)}
                        className="text-xs text-muted-foreground hover:text-foreground ml-auto"
                      >
                        Remove
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setIdPhoto("uploaded")}
                      className="flex items-center gap-2 rounded-lg border border-dashed border-border bg-background p-3 w-full hover:border-primary/50"
                    >
                      <Upload className="h-5 w-5 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">Upload ID Photo</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </Card>
        )}

        {/* Account Details */}
        {depositMethod !== "crypto" && (
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Account Holder Name</label>
              <Input
                value={accountName}
                onChange={(e) => setAccountName(e.target.value)}
                placeholder="Name on the sending account"
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Account/Phone Number</label>
              <Input
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value)}
                placeholder="Account or phone number"
                className="mt-1"
              />
            </div>
          </div>
        )}

        {/* Crypto Deposit Address */}
        {depositMethod === "crypto" && (
          <Card className="bg-muted/30 p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium">Your Deposit Address</span>
              <button className="text-primary hover:text-primary/80">
                <QrCode className="h-5 w-5" />
              </button>
            </div>
            <div className="flex items-center gap-2 rounded-lg bg-background p-3">
              <code className="flex-1 text-xs break-all">0x1234...5678abcdef1234567890abcdef</code>
              <button className="text-muted-foreground hover:text-foreground">
                <Copy className="h-4 w-4" />
              </button>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Only send USDT (ERC-20) to this address. Sending other tokens may result in loss.
            </p>
          </Card>
        )}

        {/* Submit Button */}
        <Button
          onClick={handleDeposit}
          disabled={!amount || parseFloat(amount) <= 0 || (depositMethod !== "crypto" && !idPhoto) || isLoading}
          className="w-full py-6"
        >
          {isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <>
              <ArrowDownLeft className="h-5 w-5 mr-2" />
              Deposit ${amount || "0.00"}
            </>
          )}
        </Button>
      </div>
    )
  }

  const renderWithdrawContent = () => {
    if (securityLevel < 3) {
      return (
        <Card className="border-destructive/30 bg-destructive/5 p-6 text-center">
          <Lock className="mx-auto h-12 w-12 text-destructive mb-3" />
          <h4 className="font-semibold text-destructive">Security Level 3 Required</h4>
          <p className="text-sm text-muted-foreground mt-1 mb-4">
            Withdrawals require maximum security (Level 3) to protect your funds. Set up your withdrawal PIN to continue.
          </p>
          <Button variant="destructive" onClick={onRequireSecurityUpgrade}>
            Upgrade to Level 3 <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </Card>
      )
    }

    return (
      <div className="space-y-4">
        {showBalanceBanner ? (
          <Card className="bg-gradient-to-br from-primary/10 to-accent/10 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Available Balance</p>
                <p className="text-2xl font-bold">${balance.toLocaleString()}</p>
              </div>
              <Wallet className="h-8 w-8 text-primary" />
            </div>
          </Card>
        ) : (
          <p className="text-xs text-muted-foreground">
            Amounts use your main balance on the Dashboard. Review balances there before withdrawing.
          </p>
        )}

        {/* Amount Input */}
        <div>
          <label className="text-xs font-medium text-muted-foreground">Withdrawal Amount (USD)</label>
          <div className="relative mt-1">
            <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              max={balance}
              className="pl-10 text-xl font-bold h-14"
            />
          </div>
          <div className="flex gap-2 mt-2">
            {[25, 50, 75, 100].map((pct) => (
              <button
                key={pct}
                onClick={() => setAmount((balance * pct / 100).toFixed(2))}
                className="flex-1 rounded-lg bg-muted py-2 text-sm font-medium hover:bg-muted/80"
              >
                {pct}%
              </button>
            ))}
          </div>
        </div>

        {/* Withdraw Methods */}
        <div>
          <label className="text-xs font-medium text-muted-foreground">Withdraw To</label>
          <div className="grid grid-cols-3 gap-2 mt-2">
            {withdrawMethods.map((method) => (
              <button
                key={method.id}
                onClick={() => setWithdrawMethod(method.id)}
                className={`flex flex-col items-center gap-1 rounded-lg border p-3 transition-all ${
                  withdrawMethod === method.id
                    ? "border-primary bg-primary/10"
                    : "border-border hover:border-primary/50"
                }`}
              >
                <method.icon className="h-5 w-5" />
                <span className="text-xs font-medium">{method.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Withdrawal Details */}
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">
              {withdrawMethod === "crypto" ? "Wallet Address" : "Account/Phone Number"}
            </label>
            <Input
              value={withdrawAddress}
              onChange={(e) => setWithdrawAddress(e.target.value)}
              placeholder={withdrawMethod === "crypto" ? "0x..." : "Enter account or phone number"}
              className="mt-1 font-mono"
            />
          </div>
          {withdrawMethod !== "crypto" && (
            <div>
              <label className="text-xs font-medium text-muted-foreground">Account Holder Name</label>
              <Input
                value={withdrawAccountName}
                onChange={(e) => setWithdrawAccountName(e.target.value)}
                placeholder="Name on the receiving account"
                className="mt-1"
              />
            </div>
          )}
        </div>

        {/* Withdrawal PIN */}
        <div>
          <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
            <Key className="h-3 w-3" />
            Withdrawal PIN
          </label>
          <Input
            type="password"
            maxLength={6}
            value={withdrawPin}
            onChange={(e) => setWithdrawPin(e.target.value.replace(/\D/g, ""))}
            placeholder="Enter 6-digit PIN"
            className="mt-1 text-center text-lg tracking-widest"
          />
        </div>

        {/* Warning */}
        <div className="rounded-lg bg-muted/30 p-3 flex items-start gap-2">
          <Info className="h-4 w-4 text-muted-foreground mt-0.5" />
          <p className="text-xs text-muted-foreground">
            Withdrawals are processed within 24 hours. Ensure all details are correct before submitting.
          </p>
        </div>

        {/* Submit Button */}
        <Button
          onClick={handleWithdraw}
          disabled={!amount || parseFloat(amount) <= 0 || parseFloat(amount) > balance || withdrawPin.length !== 6 || !withdrawAddress || isLoading}
          className="w-full py-6 bg-destructive hover:bg-destructive/90"
        >
          {isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <>
              <ArrowUpRight className="h-5 w-5 mr-2" />
              Withdraw ${amount || "0.00"}
            </>
          )}
        </Button>
      </div>
    )
  }

  return (
    <Card className="border-border bg-card overflow-hidden">
      {/* Tabs */}
      <div className="flex border-b border-border">
        <button
          onClick={() => setActiveTab("deposit")}
          className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-semibold transition-colors ${
            activeTab === "deposit"
              ? "bg-success/10 text-success border-b-2 border-success"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <ArrowDownLeft className="h-4 w-4" />
          Deposit
        </button>
        <button
          onClick={() => setActiveTab("withdraw")}
          className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-semibold transition-colors ${
            activeTab === "withdraw"
              ? "bg-destructive/10 text-destructive border-b-2 border-destructive"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <ArrowUpRight className="h-4 w-4" />
          Withdraw
        </button>
      </div>

      {/* Content */}
      <div className="p-4">
        {activeTab === "deposit" ? renderDepositContent() : renderWithdrawContent()}
      </div>
    </Card>
  )
}
