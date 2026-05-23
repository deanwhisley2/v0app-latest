"use client"

import { useState, useEffect, useRef } from "react"
import { 
  Bell, 
  Search, 
  Users,
  Coins,
  Receipt,
  CreditCard,
  Gift,
  Send,
  Trophy,
  Banknote,
  Mail,
  Copy,
  Check,
  Settings,
  LogOut,
  Camera,
  ChevronRight,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { ArchivedNotificationsSheet } from "./archived-notifications-sheet"
import { useNexusNotifications } from "@/contexts/NexusNotificationsContext"
import { GlobalSearch } from "./global-search"
import { useUserPreferences } from "@/contexts/UserPreferencesContext"
import { getTierBadgeLabel } from "@/lib/nexus-tier-matrix"

interface HeaderProps {
  activeTab: string
  onTabChange: (tab: string) => void
  coins?: Array<{ symbol: string; name: string; price: number; change24h: number }>
  currentUser?: { email: string; username: string; fullName: string; level: number }
  /** Level 2 retailer credit desk — combined with level for badge label. */
  retailerCreditDesk?: boolean
  /** Level 5 or retailer credit desk — Desk + Settings in primary nav. */
  operationalWorkspace?: boolean
  /** Populated from GET /api/user/referral — share link + counts */
  referral?: { referralCode: string; referralLink: string; refereeCount: number } | null
  onLogout?: () => void | Promise<void>
}

export function Header({
  activeTab,
  onTabChange,
  coins = [],
  currentUser,
  referral = null,
  onLogout,
  retailerCreditDesk = false,
  operationalWorkspace = false,
}: HeaderProps) {
  const { t } = useUserPreferences()
  const { unreadCount } = useNexusNotifications()
  const [showArchivedNotifications, setShowArchivedNotifications] = useState(false)
  const [showSearch, setShowSearch] = useState(false)
  const [showProfileMenu, setShowProfileMenu] = useState(false)
  const [copied, setCopied] = useState(false)
  const [profileView, setProfileView] = useState<"main" | "edit" | "referrals" | "orders" | "earn" | "gifts">("main")
  const [editName, setEditName] = useState(currentUser?.fullName || "")
  const [editEmail, setEditEmail] = useState(currentUser?.email || "")
  const [editPhone, setEditPhone] = useState("+256700000000")
  const [isSaving, setIsSaving] = useState(false)
  const profileMenuRef = useRef<HTMLDivElement>(null)

  const userInitials = currentUser ? currentUser.fullName.slice(0, 2).toUpperCase() : "U"
  
  // Sync edit fields when user changes
  useEffect(() => {
    if (currentUser) {
      setEditName(currentUser.fullName)
      setEditEmail(currentUser.email)
    }
  }, [currentUser])

  // Profile menu items with actions
  const profileMenuItems = [
    { icon: <Users className="h-4 w-4" />, label: "Referrals", view: "referrals" as const },
    { icon: <Coins className="h-4 w-4" />, label: "Earn", view: "earn" as const },
    { icon: <Receipt className="h-4 w-4" />, label: "Orders", view: "orders" as const },
    { icon: <CreditCard className="h-4 w-4" />, label: "Sell to Card", view: null },
    { icon: <Gift className="h-4 w-4" />, label: "Refer to Earn", view: "referrals" as const },
    { icon: <Send className="h-4 w-4" />, label: "Transfer", view: null },
    { icon: <Trophy className="h-4 w-4" />, label: "My Gifts", view: "gifts" as const },
    { icon: <Banknote className="h-4 w-4" />, label: "Loans", view: null },
  ]

  const handleSaveProfile = () => {
    setIsSaving(true)
    setTimeout(() => {
      setIsSaving(false)
      setProfileView("main")
    }, 1500)
  }

  const handleCopyReferralLink = () => {
    const text = referral?.referralLink?.trim() || ""
    if (!text) return
    void navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Close profile menu on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(e.target as Node)) {
        setShowProfileMenu(false)
      }
    }
    if (showProfileMenu) {
      document.addEventListener("mousedown", handleClickOutside)
    }
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [showProfileMenu])

  // Keyboard shortcuts: Ctrl+K or "/" to open search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+K or Cmd+K
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault()
        setShowSearch(true)
      }
      // "/" to open search (only when not typing in an input)
      if (e.key === "/" && !showSearch && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault()
        setShowSearch(true)
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [showSearch])
  
  const mainTabsAll = [
    { id: "container", labelKey: "nav.container" },
    { id: "wallstreet", labelKey: "nav.wallstreet" },
    { id: "notifications", labelKey: "nav.notifications" },
    { id: "settings", labelKey: "nav.settings" },
  ] as const
  const mainTabs = operationalWorkspace
    ? ([
        { id: "desk", labelKey: "nav.desk" },
        { id: "settings", labelKey: "nav.settings" },
      ] as const)
    : mainTabsAll

  const resolvedHeaderActive =
    activeTab === "wallet" ? (operationalWorkspace ? "desk" : "notifications") : activeTab

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-border/80 bg-background/95 max-md:[backdrop-filter:none] md:backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-[1600px] items-center justify-between px-4 sm:h-16">
          {/* Brand Name */}
          <div className="flex items-center">
            <div className="flex flex-col leading-none">
              <span className="font-mono text-xl font-bold tracking-tight text-foreground sm:text-2xl">NEXUS</span>
              <span className="text-[10px] font-semibold tracking-[0.28em] text-muted-foreground sm:text-xs">PRO</span>
            </div>
          </div>

          {/* Mobile: bottom nav. Desktop (md+): section tabs in header — bottom bar is hidden on wide screens. */}
          <nav className="hidden md:flex md:flex-1 md:items-center md:justify-center md:gap-1">
            {mainTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => onTabChange(tab.id)}
                className={`rounded-xl px-3 py-2 text-sm font-medium transition-colors duration-200 lg:px-4 ${
                  resolvedHeaderActive === tab.id
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                }`}
              >
                {t(tab.labelKey)}
              </button>
            ))}
          </nav>

          {/* Right Side */}
          <div className="flex items-center gap-3">
            {/* Search Button with Animation */}
            <button
              onClick={() => setShowSearch(true)}
              className="group flex items-center gap-2 rounded-full border border-border bg-muted/50 px-3 py-1.5 text-sm transition-all hover:border-primary hover:bg-muted"
            >
              <Search className="h-4 w-4 text-muted-foreground group-hover:text-primary" />
              <span className="hidden sm:inline text-muted-foreground group-hover:text-foreground">
                <span className="max-md:animate-none md:animate-pulse">{t("header.cantFind")}</span>
              </span>
              <kbd className="hidden lg:inline-flex items-center rounded border border-border bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground">
                /
              </kbd>
            </button>

            {/* Notifications */}
            <Button
              variant="ghost"
              size="icon"
              className="relative"
              onClick={() => {
                setShowProfileMenu(false)
                if (window.matchMedia("(min-width: 768px)").matches) {
                  onTabChange(operationalWorkspace ? "desk" : "notifications")
                  setShowArchivedNotifications(false)
                  return
                }
                setShowArchivedNotifications((v) => !v)
              }}
            >
              <Bell className="h-5 w-5 text-muted-foreground" />
              {unreadCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 font-mono text-[10px] font-bold text-destructive-foreground">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </Button>

            {/* User Avatar - opens floating profile menu */}
            <div className="relative" ref={profileMenuRef}>
              <button
                onClick={() => {
                  setShowProfileMenu(!showProfileMenu)
                  setShowArchivedNotifications(false)
                }}
                title="View Profile"
                className={`flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-primary font-semibold text-primary-foreground transition-colors hover:bg-primary/90 ${showProfileMenu ? "ring-2 ring-primary/40 ring-offset-2 ring-offset-background" : ""}`}
              >
                <span className="text-sm font-bold">{userInitials}</span>
              </button>

              {/* Floating Profile Menu */}
              {showProfileMenu && (
                <div className="absolute right-0 top-12 z-50 w-80 max-md:animate-none md:animate-in md:fade-in md:slide-in-from-top-2 md:duration-200">
                  <div className="overflow-hidden rounded-2xl border border-border bg-card max-md:shadow-none md:shadow-2xl">
                    
                    {/* Main Profile View */}
                    {profileView === "main" && (
                      <>
                        {/* Profile Header */}
                        <div className="relative border-b border-border bg-muted/40 p-4">
                          <button
                            onClick={() => { setShowProfileMenu(false); setProfileView("main") }}
                            className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full bg-background/50 text-muted-foreground hover:bg-background hover:text-foreground"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                          <div className="flex items-center gap-3">
                            <div className="relative">
                              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-xl font-bold text-primary-foreground">
                                {userInitials}
                              </div>
                              <button 
                                onClick={() => setProfileView("edit")}
                                className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-card bg-primary text-white hover:bg-primary/90"
                              >
                                <Camera className="h-3 w-3" />
                              </button>
                            </div>
                            <div className="min-w-0 flex-1">
                              <h4 className="truncate font-semibold text-foreground">{currentUser?.fullName || "User"}</h4>
                              <p className="text-sm text-muted-foreground">@{currentUser?.username || "user"}</p>
                              <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-success/20 px-2 py-0.5 text-xs font-semibold text-success">
                                <Check className="h-3 w-3" />{" "}
                                {getTierBadgeLabel(currentUser?.level ?? 1, retailerCreditDesk)}
                              </span>
                            </div>
                          </div>
                          {/* Edit Profile Button */}
                          <button
                            onClick={() => setProfileView("edit")}
                            className="mt-3 w-full rounded-lg bg-background/50 py-2 text-xs font-medium text-foreground hover:bg-background"
                          >
                            Edit Profile
                          </button>
                        </div>

                        {/* Profile Info */}
                        <div className="border-b border-border p-3 space-y-2">
                          <div className="flex items-center gap-2 rounded-lg bg-muted/30 px-3 py-2 text-sm">
                            <Mail className="h-4 w-4 text-muted-foreground" />
                            <span className="flex-1 truncate text-muted-foreground">{currentUser?.email || "user@example.com"}</span>
                            <Check className="h-4 w-4 text-success" />
                          </div>
                          <div className="flex flex-col gap-1 rounded-lg bg-muted/30 px-3 py-2 text-sm">
                            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Referral link</span>
                            <div className="flex items-center gap-2">
                              <span className="flex-1 truncate font-mono text-[11px] text-muted-foreground" title={referral?.referralLink}>
                                {referral?.referralLink ? referral.referralLink : "Loading…"}
                              </span>
                              <button
                                type="button"
                                onClick={handleCopyReferralLink}
                                disabled={!referral?.referralLink}
                                className="shrink-0 text-muted-foreground hover:text-foreground disabled:opacity-40"
                              >
                                {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
                              </button>
                            </div>
                            {referral?.referralCode ? (
                              <p className="text-[10px] text-muted-foreground">Code: {referral.referralCode}</p>
                            ) : null}
                          </div>
                        </div>

                        {/* Menu Items */}
                        <div className="max-h-64 overflow-y-auto p-2">
                          <div className="grid grid-cols-2 gap-1">
                            {profileMenuItems.map((item) => (
                              <button
                                key={item.label}
                                onClick={() => item.view && setProfileView(item.view)}
                                className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-muted/50"
                              >
                                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                                  {item.icon}
                                </div>
                                <div className="min-w-0">
                                  <p className="text-xs font-medium truncate">{item.label}</p>
                                </div>
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Footer Actions */}
                        <div className="border-t border-border p-2 space-y-1">
                          <button 
                            onClick={() => { onTabChange("settings"); setShowProfileMenu(false); setProfileView("main") }}
                            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-muted/50"
                          >
                            <Settings className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm font-medium">Settings</span>
                            <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground" />
                          </button>
                          <button 
                            type="button"
                            onClick={() => {
                              void (async () => {
                                try {
                                  await onLogout?.()
                                } finally {
                                  setShowProfileMenu(false)
                                }
                              })()
                            }}
                            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-destructive transition-colors hover:bg-destructive/10"
                          >
                            <LogOut className="h-4 w-4" />
                            <span className="text-sm font-medium">Log Out</span>
                          </button>
                        </div>
                      </>
                    )}

                    {/* Edit Profile View */}
                    {profileView === "edit" && (
                      <div className="p-4">
                        <div className="flex items-center justify-between mb-4">
                          <button onClick={() => setProfileView("main")} className="text-muted-foreground hover:text-foreground">
                            <ChevronRight className="h-5 w-5 rotate-180" />
                          </button>
                          <h3 className="font-semibold">Edit Profile</h3>
                          <button onClick={() => { setShowProfileMenu(false); setProfileView("main") }} className="text-muted-foreground hover:text-foreground">
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                        
                        <div className="flex justify-center mb-4">
                          <div className="relative">
                            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary text-2xl font-bold text-primary-foreground">
                              {userInitials}
                            </div>
                            <button className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full border-2 border-card bg-primary text-white">
                              <Camera className="h-4 w-4" />
                            </button>
                          </div>
                        </div>

                        <div className="space-y-3">
                          <div>
                            <label className="text-xs text-muted-foreground">Full Name</label>
                            <input
                              type="text"
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              className="w-full rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm outline-none focus:border-primary"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-muted-foreground">Email</label>
                            <input
                              type="email"
                              value={editEmail}
                              onChange={(e) => setEditEmail(e.target.value)}
                              className="w-full rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm outline-none focus:border-primary"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-muted-foreground">Phone Number</label>
                            <input
                              type="tel"
                              value={editPhone}
                              onChange={(e) => setEditPhone(e.target.value)}
                              className="w-full rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm outline-none focus:border-primary"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-muted-foreground">Username (read-only)</label>
                            <input
                              type="text"
                              value={`@${currentUser?.username || "user"}`}
                              disabled
                              className="w-full rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm text-muted-foreground"
                            />
                          </div>
                        </div>

                        <button
                          onClick={handleSaveProfile}
                          disabled={isSaving}
                          className="mt-4 w-full rounded-lg bg-primary py-2.5 font-semibold text-white hover:bg-primary/90 disabled:opacity-50"
                        >
                          {isSaving ? "Saving..." : "Save Changes"}
                        </button>
                      </div>
                    )}

                    {/* Referrals View */}
                    {profileView === "referrals" && (
                      <div className="p-4">
                        <div className="flex items-center justify-between mb-4">
                          <button onClick={() => setProfileView("main")} className="text-muted-foreground hover:text-foreground">
                            <ChevronRight className="h-5 w-5 rotate-180" />
                          </button>
                          <h3 className="font-semibold">Referrals</h3>
                          <button onClick={() => { setShowProfileMenu(false); setProfileView("main") }} className="text-muted-foreground hover:text-foreground">
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                        
                        <div className="nexus-stat-tile mb-4 p-4 text-center">
                          <p className="text-lg font-semibold text-primary">Referral rewards</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            Bonus pays after each referee&apos;s first successful deposit (once per user).
                          </p>
                        </div>

                        <div className="grid grid-cols-2 gap-3 mb-4">
                          <div className="rounded-lg bg-muted/30 p-3 text-center">
                            <p className="text-xl font-bold">{referral?.refereeCount ?? "—"}</p>
                            <p className="text-xs text-muted-foreground">Signups attributed</p>
                          </div>
                          <div className="rounded-lg bg-muted/30 p-3 text-center">
                            <p className="text-xl font-bold text-muted-foreground">—</p>
                            <p className="text-xs text-muted-foreground">Rewards (pending payout)</p>
                          </div>
                        </div>

                        <div className="rounded-lg bg-muted/30 p-3 space-y-2">
                          <p className="text-xs text-muted-foreground">Your referral link</p>
                          <div className="flex items-center gap-2">
                            <code className="flex-1 break-all font-mono text-[11px] font-medium">{referral?.referralLink ?? "…"}</code>
                            <button
                              type="button"
                              className="shrink-0 text-primary hover:text-primary/80"
                              onClick={() => {
                                if (referral?.referralLink) {
                                  void navigator.clipboard.writeText(referral.referralLink)
                                }
                              }}
                            >
                              <Copy className="h-4 w-4" />
                            </button>
                          </div>
                          <p className="text-[10px] text-muted-foreground font-mono">Code: {referral?.referralCode ?? "—"}</p>
                        </div>
                      </div>
                    )}

                    {/* Orders View */}
                    {profileView === "orders" && (
                      <div className="p-4">
                        <div className="flex items-center justify-between mb-4">
                          <button onClick={() => setProfileView("main")} className="text-muted-foreground hover:text-foreground">
                            <ChevronRight className="h-5 w-5 rotate-180" />
                          </button>
                          <h3 className="font-semibold">Order History</h3>
                          <button onClick={() => { setShowProfileMenu(false); setProfileView("main") }} className="text-muted-foreground hover:text-foreground">
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                        
                        <div className="space-y-2 max-h-60 overflow-y-auto">
                          {[
                            { id: "ORD-001", type: "Buy", coin: "BTC", amount: "$500", status: "Completed" },
                            { id: "ORD-002", type: "Sell", coin: "ETH", amount: "$250", status: "Completed" },
                            { id: "ORD-003", type: "Buy", coin: "SOL", amount: "$100", status: "Pending" },
                          ].map((order) => (
                            <div key={order.id} className="flex items-center justify-between rounded-lg bg-muted/30 p-3">
                              <div>
                                <p className="text-sm font-medium">{order.type} {order.coin}</p>
                                <p className="text-xs text-muted-foreground">{order.id}</p>
                              </div>
                              <div className="text-right">
                                <p className="text-sm font-bold">{order.amount}</p>
                                <p className={`text-xs ${order.status === "Completed" ? "text-success" : "text-warning"}`}>{order.status}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Earn View */}
                    {profileView === "earn" && (
                      <div className="p-4">
                        <div className="flex items-center justify-between mb-4">
                          <button onClick={() => setProfileView("main")} className="text-muted-foreground hover:text-foreground">
                            <ChevronRight className="h-5 w-5 rotate-180" />
                          </button>
                          <h3 className="font-semibold">Earn Rewards</h3>
                          <button onClick={() => { setShowProfileMenu(false); setProfileView("main") }} className="text-muted-foreground hover:text-foreground">
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                        
                        <div className="nexus-stat-tile mb-4 p-4 text-center">
                          <p className="text-2xl font-bold text-success">Up to 12% APY</p>
                          <p className="text-xs text-muted-foreground">on your crypto holdings</p>
                        </div>
                        
                        <div className="space-y-2">
                          {[
                            { coin: "BTC", apy: "5.5%", staked: "$1,200" },
                            { coin: "ETH", apy: "8.2%", staked: "$800" },
                            { coin: "USDT", apy: "12%", staked: "$500" },
                          ].map((item) => (
                            <div key={item.coin} className="flex items-center justify-between rounded-lg bg-muted/30 p-3">
                              <div className="flex items-center gap-2">
                                <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold">{item.coin}</div>
                                <div>
                                  <p className="text-sm font-medium">{item.coin}</p>
                                  <p className="text-xs text-success">{item.apy} APY</p>
                                </div>
                              </div>
                              <p className="text-sm font-bold">{item.staked}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Gifts View */}
                    {profileView === "gifts" && (
                      <div className="p-4">
                        <div className="flex items-center justify-between mb-4">
                          <button onClick={() => setProfileView("main")} className="text-muted-foreground hover:text-foreground">
                            <ChevronRight className="h-5 w-5 rotate-180" />
                          </button>
                          <h3 className="font-semibold">My Gifts</h3>
                          <button onClick={() => { setShowProfileMenu(false); setProfileView("main") }} className="text-muted-foreground hover:text-foreground">
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                        
                        <div className="space-y-2">
                          <div className="rounded-lg border border-success/30 bg-success/5 p-3">
                            <div className="flex items-center gap-2 mb-2">
                              <Gift className="h-4 w-4 text-success" />
                              <span className="text-sm font-medium text-success">Welcome Bonus</span>
                            </div>
                            <p className="text-xl font-bold">$10.00</p>
                            <p className="text-xs text-muted-foreground">Claimed on signup</p>
                          </div>
                          <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
                            <div className="flex items-center gap-2 mb-2">
                              <Trophy className="h-4 w-4 text-primary" />
                              <span className="text-sm font-medium text-primary">Trading Reward</span>
                            </div>
                            <p className="text-xl font-bold">$25.00</p>
                            <p className="text-xs text-muted-foreground">First trade bonus</p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Notification Panel */}
      <ArchivedNotificationsSheet
        isOpen={showArchivedNotifications}
        onClose={() => setShowArchivedNotifications(false)}
      />

      {/* Global Search */}
      <GlobalSearch
        isOpen={showSearch}
        onClose={() => setShowSearch(false)}
        onNavigate={onTabChange}
        coins={coins}
      />
    </>
  )
}
