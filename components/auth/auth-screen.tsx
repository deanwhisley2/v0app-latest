"use client"

import { useState, useCallback, useEffect } from "react"
import {
  Eye,
  EyeOff,
  Mail,
  Phone,
  Lock,
  User,
  Shield,
  MessageCircle,
  Bot,
  Headphones,
  Send,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ArrowRight,
  X,
  Sparkles,
  HelpCircle,
  Video,
  Camera,
  Play,
  Square,
  Check,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { TRADING_USER_LEVEL } from "@/lib/trading-user-level"
import { getNexusAssistantWelcome } from "@/lib/nexus-assistant"
import { requestNexusAssistantReply } from "@/lib/nexus-assistant/client"

type AuthStep = "signin" | "signup" | "2fa" | "forgot-password" | "reset-password" | "video-recovery"
type OtpMethod = "email" | "phone"

interface AssistantMessage {
  role: "user" | "assistant"
  content: string
  timestamp: Date
}

interface UserAccount {
  email: string
  username: string
  password: string
  fullName: string
  phone: string
  level: number
  isDemo?: boolean
  videoSelfie?: string // base64 encoded video
  securityQuestions?: {
    lastBalance?: string
    lastTransaction?: string
    lastTrade?: string
  }
  securityLevel?: 1 | 2 | 3
}

// Demo account at level 1 (same as guest / new users) + registered users stored in localStorage
const DEMO_ACCOUNT: UserAccount = {
  email: "dean@gmail.com",
  username: "dean",
  password: "123456",
  fullName: "Dean",
  phone: "+256700000000",
  level: TRADING_USER_LEVEL,
  isDemo: true,
}

const getStoredUsers = (): UserAccount[] => {
  if (typeof window === "undefined") return [DEMO_ACCOUNT]
  const stored = localStorage.getItem("nexus_users")
  const users = stored ? JSON.parse(stored) : []
  return [DEMO_ACCOUNT, ...users]
}

const saveUser = (user: UserAccount) => {
  if (typeof window === "undefined") return
  const users = getStoredUsers().filter(u => !u.isDemo)
  users.push(user)
  localStorage.setItem("nexus_users", JSON.stringify(users))
}

const findUser = (identifier: string, password: string): UserAccount | null => {
  const users = getStoredUsers()
  const lowerIdentifier = identifier.toLowerCase()
  return users.find(u => 
    (u.email.toLowerCase() === lowerIdentifier || u.username.toLowerCase() === lowerIdentifier) && 
    u.password === password
  ) || null
}

const isEmailTaken = (email: string): boolean => {
  const users = getStoredUsers()
  return users.some(u => u.email.toLowerCase() === email.toLowerCase())
}

const isUsernameTaken = (username: string): boolean => {
  const users = getStoredUsers()
  return users.some(u => u.username.toLowerCase() === username.toLowerCase())
}

const INSTRUCTIONS = [
  "Sign in with your email/phone and password to access your trading account.",
  "New users must create an account with verified email and phone number.",
  "2FA verification is required for all logins to ensure account security.",
  "Click the Joelin button below for help anytime.",
]

const QUICK_QUESTIONS = [
  { icon: HelpCircle, label: "How to login?", query: "How do I log in to my account?" },
  { icon: Shield, label: "Reset password", query: "How do I reset my password?" },
  { icon: MessageCircle, label: "2FA issues", query: "I'm not receiving my 2FA code" },
  { icon: Headphones, label: "Human support", query: "I need to speak with a human agent" },
]

interface AuthScreenProps {
  onAuthenticated: (user: { email: string; username: string; fullName: string; level: number }) => void
}

export function AuthScreen({ onAuthenticated }: AuthScreenProps) {
  const [step, setStep] = useState<AuthStep>("signin")
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  const [otpMethod, setOtpMethod] = useState<OtpMethod>("email")
  const [twoFactorMethod, set2faMethod] = useState<OtpMethod>("email")
  const [otpSent, setOtpSent] = useState(false)
  const [showAssistant, setShowAssistant] = useState(false)
  const [showInstructions, setShowInstructions] = useState(true)

  // Auto-hide instructions after 8 seconds
  useEffect(() => {
    if (showInstructions) {
      const timer = setTimeout(() => setShowInstructions(false), 8000)
      return () => clearTimeout(timer)
    }
  }, [showInstructions])

  // Form fields
  const [signinIdentifier, setSigninIdentifier] = useState("")
  const [signinPassword, setSigninPassword] = useState("")
  const [signupName, setSignupName] = useState("")
  const [signupUsername, setSignupUsername] = useState("")
  const [signupEmail, setSignupEmail] = useState("")
  const [signupPhone, setSignupPhone] = useState("")
  const [signupPassword, setSignupPassword] = useState("")
  const [otpCode, setOtpCode] = useState("")
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(null)
  const [resetEmail, setResetEmail] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [resetLinkSent, setResetLinkSent] = useState(false)
  const [resetLinkExpiry, setResetLinkExpiry] = useState<Date | null>(null)
  const [resetLinkExpired, setResetLinkExpired] = useState(false)
  
  // Video selfie states
  const [isRecordingVideo, setIsRecordingVideo] = useState(false)
  const [videoRecorded, setVideoRecorded] = useState(false)
  const [showVideoModal, setShowVideoModal] = useState(false)
  const [videoRecoveryPassword, setVideoRecoveryPassword] = useState("")
  const [videoRecoveryAnswer, setVideoRecoveryAnswer] = useState("")
  const [securityQuestion, setSecurityQuestion] = useState<"balance" | "transaction" | "trade">("balance")

  // Assistant
  const [assistantMessages, setAssistantMessages] = useState<AssistantMessage[]>([
    {
      role: "assistant",
      content: getNexusAssistantWelcome("auth_screen", false),
      timestamp: new Date(),
    },
  ])
  const [assistantInput, setAssistantInput] = useState("")
  const [isAssistantLoading, setIsAssistantLoading] = useState(false)

  const handleSignIn = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      setError("")
      setIsLoading(true)

      await new Promise((r) => setTimeout(r, 1000))

      if (!signinIdentifier || !signinPassword) {
        setError("Please enter your email/username and password.")
        setIsLoading(false)
        return
      }

      // Check credentials
      const user = findUser(signinIdentifier, signinPassword)
      if (!user) {
        setError("Invalid email/username or password.")
        setIsLoading(false)
        return
      }

      setCurrentUser(user)
      setIsLoading(false)
      setStep("2fa")
    },
    [signinIdentifier, signinPassword]
  )

  const handleSignUp = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      setError("")
      setIsLoading(true)

      await new Promise((r) => setTimeout(r, 1000))

      if (!signupName || !signupUsername || !signupEmail || !signupPhone || !signupPassword) {
        setError("Please fill in all fields.")
        setIsLoading(false)
        return
      }

      // Validate username
      if (signupUsername.length < 3) {
        setError("Username must be at least 3 characters.")
        setIsLoading(false)
        return
      }

      if (!/^[a-zA-Z0-9_]+$/.test(signupUsername)) {
        setError("Username can only contain letters, numbers, and underscores.")
        setIsLoading(false)
        return
      }

      if (isUsernameTaken(signupUsername)) {
        setError("This username is already taken.")
        setIsLoading(false)
        return
      }

      if (isEmailTaken(signupEmail)) {
        setError("This email is already registered.")
        setIsLoading(false)
        return
      }

      if (signupPassword.length < 6) {
        setError("Password must be at least 6 characters.")
        setIsLoading(false)
        return
      }

      // Save the new user
      const newUser: UserAccount = {
        email: signupEmail,
        username: signupUsername.toLowerCase(),
        password: signupPassword,
        fullName: signupName,
        phone: signupPhone,
        level: TRADING_USER_LEVEL,
      }
      saveUser(newUser)

      setIsLoading(false)
      setSigninIdentifier(signupUsername) // Auto-fill username for login
      setStep("signin")
    },
    [signupName, signupUsername, signupEmail, signupPhone, signupPassword]
  )

  const handleSendOTP = useCallback(async () => {
    setIsLoading(true)
    await new Promise((r) => setTimeout(r, 800))
    setOtpSent(true)
    setIsLoading(false)
  }, [])

  const handleVerify2FA = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      setError("")
      setIsLoading(true)

      await new Promise((r) => setTimeout(r, 1000))

      if (otpCode.length < 4) {
        setError("Please enter a valid verification code.")
        setIsLoading(false)
        return
      }

      setIsLoading(false)
      if (currentUser) {
        onAuthenticated({
          email: currentUser.email,
          username: currentUser.username,
          fullName: currentUser.fullName,
          level: currentUser.level,
        })
      }
    },
    [otpCode, onAuthenticated, currentUser]
  )

  const handleForgotPassword = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      setError("")
      setIsLoading(true)

      await new Promise((r) => setTimeout(r, 1000))

      if (!resetEmail) {
        setError("Please enter your email address.")
        setIsLoading(false)
        return
      }

      // Set expiry to 6 hours from now
      const expiry = new Date()
      expiry.setHours(expiry.getHours() + 6)
      setResetLinkExpiry(expiry)
      setResetLinkSent(true)
      setIsLoading(false)
    },
    [resetEmail]
  )

  const handleResetPassword = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      setError("")

      // Check if reset link has expired (6 hours)
      if (resetLinkExpiry && new Date() > resetLinkExpiry) {
        setResetLinkExpired(true)
        setError("Password reset link has expired. Please request a new one.")
        return
      }

      setIsLoading(true)
      await new Promise((r) => setTimeout(r, 1000))

      if (!newPassword || !confirmPassword) {
        setError("Please fill in all fields.")
        setIsLoading(false)
        return
      }

      if (newPassword.length < 10) {
        setError("Password must be at least 10 characters.")
        setIsLoading(false)
        return
      }

      if (newPassword !== confirmPassword) {
        setError("Passwords do not match.")
        setIsLoading(false)
        return
      }

      // Reset successful
      setIsLoading(false)
      setResetLinkSent(false)
      setResetLinkExpiry(null)
      setResetEmail("")
      setNewPassword("")
      setConfirmPassword("")
      setStep("signin")
    },
    [newPassword, confirmPassword, resetLinkExpiry]
  )

  const handleAssistantSubmit = useCallback(async (query?: string) => {
    const message = query || assistantInput.trim()
    if (!message) return

    setAssistantMessages((prev) => [...prev, { role: "user", content: message, timestamp: new Date() }])
    setAssistantInput("")
    setIsAssistantLoading(true)

    await new Promise((r) => setTimeout(r, 1000 + Math.random() * 1000))

    const response = await requestNexusAssistantReply({
      userMessage: message,
      surface: "auth_screen",
      authStep: step,
      tradingUserLevel: TRADING_USER_LEVEL,
      isGuest: false,
    })
    setAssistantMessages((prev) => [...prev, { role: "assistant", content: response, timestamp: new Date() }])
    setIsAssistantLoading(false)
  }, [assistantInput, step])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background p-4">
      {/* Background Pattern */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/5 via-background to-background" />
      
      <div className="relative w-full max-w-md">
        {/* Auth Card */}
        <div className="rounded-2xl border border-border bg-card p-6 shadow-2xl">
          {/* Logo & Title */}
          <div className="mb-6 text-center">
            <img 
              src="/logo.jpg" 
              alt="Nexus Pro" 
              className="mx-auto mb-3 h-20 w-20 rounded-xl shadow-lg shadow-primary/30"
            />
            <h1 className="bg-gradient-to-r from-cyan-400 to-primary bg-clip-text text-xl font-bold text-transparent">
              Nexus Pro Trading
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {step === "signin" && "Sign in to access your account"}
              {step === "signup" && "Create your trading account"}
              {step === "2fa" && "Complete 2FA verification"}
              {step === "forgot-password" && "Reset your password"}
              {step === "reset-password" && "Create new password"}
            </p>
          </div>

          {/* Help Button - Shows instructions popup */}
          <button
            onClick={() => setShowInstructions(true)}
            className="absolute -top-2 right-4 flex h-8 w-8 items-center justify-center rounded-full bg-primary/20 text-primary transition-all hover:bg-primary/30 hover:scale-110"
            title="Show instructions"
          >
            <HelpCircle className="h-4 w-4" />
          </button>

          {/* Tabs (Sign In / Sign Up) - Only show when on signin/signup */}
          {(step === "signin" || step === "signup") && (
            <div className="mb-4 flex gap-2">
              <button
                onClick={() => setStep("signin")}
                className={`flex-1 rounded-lg py-2.5 text-sm font-semibold transition-colors ${
                  step === "signin"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                Sign In
              </button>
              <button
                onClick={() => setStep("signup")}
                className={`flex-1 rounded-lg py-2.5 text-sm font-semibold transition-colors ${
                  step === "signup"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                Sign Up
              </button>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="mb-4 flex items-center gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Sign In Form */}
          {step === "signin" && (
            <form onSubmit={handleSignIn} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Email or Username</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    value={signinIdentifier}
                    onChange={(e) => setSigninIdentifier(e.target.value)}
                    placeholder="dean@gmail.com or username"
                    className="w-full rounded-lg border border-border bg-background py-2.5 pl-10 pr-4 text-sm outline-none transition-colors focus:border-primary"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type={showPassword ? "text" : "password"}
                    value={signinPassword}
                    onChange={(e) => setSigninPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="w-full rounded-lg border border-border bg-background py-2.5 pl-10 pr-10 text-sm outline-none transition-colors focus:border-primary"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="flex justify-between">
                <button
                  type="button"
                  onClick={() => {
                    setStep("video-recovery")
                    setError("")
                  }}
                  className="flex items-center gap-1 text-xs text-accent hover:underline"
                >
                  <Video className="h-3 w-3" />
                  Video Recovery
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setStep("forgot-password")
                    setError("")
                    setResetLinkSent(false)
                    setResetLinkExpired(false)
                  }}
                  className="text-xs text-primary hover:underline"
                >
                  Forgot Password?
                </button>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="flex w-full items-center justify-center gap-2 rounded-full bg-primary py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Continue to 2FA <ArrowRight className="h-4 w-4" /></>}
              </button>

              {/* Divider */}
              <div className="relative my-4">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="bg-card px-3 text-muted-foreground">or continue with</span>
                </div>
              </div>

              {/* Social Login Buttons */}
              <div className="grid grid-cols-3 gap-2">
                {/* Google */}
                <button
                  type="button"
                  onClick={() => {
                    setIsLoading(true)
                    setTimeout(() => {
                      set2faMethod("email")
                      setStep("2fa")
                      setIsLoading(false)
                    }, 1000)
                  }}
                  className="flex items-center justify-center gap-2 rounded-lg border border-border bg-background py-2.5 text-sm font-medium transition-colors hover:bg-muted"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  <span className="hidden sm:inline">Google</span>
                </button>

                {/* Apple */}
                <button
                  type="button"
                  onClick={() => {
                    setIsLoading(true)
                    setTimeout(() => {
                      set2faMethod("email")
                      setStep("2fa")
                      setIsLoading(false)
                    }, 1000)
                  }}
                  className="flex items-center justify-center gap-2 rounded-lg border border-border bg-background py-2.5 text-sm font-medium transition-colors hover:bg-muted"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
                  </svg>
                  <span className="hidden sm:inline">Apple</span>
                </button>

                {/* X (Twitter) */}
                <button
                  type="button"
                  onClick={() => {
                    setIsLoading(true)
                    setTimeout(() => {
                      set2faMethod("email")
                      setStep("2fa")
                      setIsLoading(false)
                    }, 1000)
                  }}
                  className="flex items-center justify-center gap-2 rounded-lg border border-border bg-background py-2.5 text-sm font-medium transition-colors hover:bg-muted"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                  </svg>
                  <span className="hidden sm:inline">X</span>
                </button>
              </div>
            </form>
          )}

          {/* Forgot Password Form */}
          {step === "forgot-password" && (
            <div className="space-y-4">
              {!resetLinkSent ? (
                <form onSubmit={handleForgotPassword} className="space-y-4">
                  <p className="text-center text-sm text-muted-foreground">
                    Enter your email address and we&apos;ll send you a link to reset your password.
                  </p>

                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Email Address</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <input
                        type="email"
                        value={resetEmail}
                        onChange={(e) => setResetEmail(e.target.value)}
                        placeholder="you@example.com"
                        className="w-full rounded-lg border border-border bg-background py-2.5 pl-10 pr-4 text-sm outline-none transition-colors focus:border-primary"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="flex w-full items-center justify-center gap-2 rounded-full bg-primary py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                  >
                    {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send Reset Link"}
                  </button>

                  <button
                    type="button"
                    onClick={() => setStep("signin")}
                    className="w-full text-center text-sm text-muted-foreground hover:text-foreground"
                  >
                    Back to Sign In
                  </button>
                </form>
              ) : (
                <div className="space-y-4">
                  <div className="rounded-lg bg-success/10 p-4 text-center">
                    <CheckCircle2 className="mx-auto mb-2 h-10 w-10 text-success" />
                    <h3 className="font-semibold text-success">Reset Link Sent!</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      We&apos;ve sent a password reset link to <strong>{resetEmail}</strong>
                    </p>
                  </div>

                  <div className="rounded-lg border border-warning/30 bg-warning/10 p-3">
                    <p className="text-center text-xs text-warning">
                      <AlertCircle className="mb-1 inline h-4 w-4" />
                      <br />
                      This link will expire in <strong>6 hours</strong>
                      {resetLinkExpiry && (
                        <span className="block mt-1 text-muted-foreground">
                          Valid until: {resetLinkExpiry.toLocaleTimeString()} on {resetLinkExpiry.toLocaleDateString()}
                        </span>
                      )}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setStep("reset-password")}
                    className="flex w-full items-center justify-center gap-2 rounded-full bg-primary py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                  >
                    Continue to Reset Password <ArrowRight className="h-4 w-4" />
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setResetLinkSent(false)
                      setResetEmail("")
                    }}
                    className="w-full text-center text-sm text-muted-foreground hover:text-foreground"
                  >
                    Use a different email
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Reset Password Form */}
          {step === "reset-password" && (
            <form onSubmit={handleResetPassword} className="space-y-4">
              {resetLinkExpired ? (
                <div className="space-y-4">
                  <div className="rounded-lg bg-destructive/10 p-4 text-center">
                    <AlertCircle className="mx-auto mb-2 h-10 w-10 text-destructive" />
                    <h3 className="font-semibold text-destructive">Link Expired</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      This password reset link has expired after 6 hours.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setStep("forgot-password")
                      setResetLinkSent(false)
                      setResetLinkExpired(false)
                      setResetEmail("")
                    }}
                    className="flex w-full items-center justify-center gap-2 rounded-full bg-primary py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                  >
                    Request New Reset Link
                  </button>
                </div>
              ) : (
                <>
                  <p className="text-center text-sm text-muted-foreground">
                    Create a new password for your account.
                  </p>

                  {resetLinkExpiry && (
                    <div className="rounded-lg border border-border bg-muted/30 p-2 text-center">
                      <p className="text-xs text-muted-foreground">
                        Link expires at: <strong>{resetLinkExpiry.toLocaleTimeString()}</strong>
                      </p>
                    </div>
                  )}

                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-muted-foreground">New Password (min 10 characters)</label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <input
                        type={showPassword ? "text" : "password"}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Create a strong password"
                        className="w-full rounded-lg border border-border bg-background py-2.5 pl-10 pr-10 text-sm outline-none transition-colors focus:border-primary"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Confirm Password</label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <input
                        type={showPassword ? "text" : "password"}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Confirm your password"
                        className="w-full rounded-lg border border-border bg-background py-2.5 pl-10 pr-10 text-sm outline-none transition-colors focus:border-primary"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="flex w-full items-center justify-center gap-2 rounded-full bg-primary py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                  >
                    {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Reset Password"}
                  </button>

                  <button
                    type="button"
                    onClick={() => setStep("signin")}
                    className="w-full text-center text-sm text-muted-foreground hover:text-foreground"
                  >
                    Back to Sign In
                  </button>
                </>
              )}
            </form>
          )}

          {/* Sign Up Form */}
          {step === "signup" && (
            <form onSubmit={handleSignUp} className="space-y-3">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Full Name</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    value={signupName}
                    onChange={(e) => setSignupName(e.target.value)}
                    placeholder="Your full name"
                    className="w-full rounded-lg border border-border bg-background py-2.5 pl-10 pr-4 text-sm outline-none transition-colors focus:border-primary"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Username</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">@</span>
                  <input
                    type="text"
                    value={signupUsername}
                    onChange={(e) => setSignupUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                    placeholder="choose_a_username"
                    className="w-full rounded-lg border border-border bg-background py-2.5 pl-10 pr-4 text-sm outline-none transition-colors focus:border-primary"
                  />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">You can use this to login instead of email</p>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="email"
                    value={signupEmail}
                    onChange={(e) => setSignupEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full rounded-lg border border-border bg-background py-2.5 pl-10 pr-4 text-sm outline-none transition-colors focus:border-primary"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Phone Number</label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="tel"
                    value={signupPhone}
                    onChange={(e) => setSignupPhone(e.target.value)}
                    placeholder="+1234567890"
                    className="w-full rounded-lg border border-border bg-background py-2.5 pl-10 pr-4 text-sm outline-none transition-colors focus:border-primary"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Password (min 6 characters)</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type={showPassword ? "text" : "password"}
                    value={signupPassword}
                    onChange={(e) => setSignupPassword(e.target.value)}
                    placeholder="Create a strong password"
                    className="w-full rounded-lg border border-border bg-background py-2.5 pl-10 pr-10 text-sm outline-none transition-colors focus:border-primary"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* Video Selfie Section */}
              <div className="rounded-lg border border-dashed border-accent/50 bg-accent/5 p-3">
                <div className="flex items-center gap-2 mb-2">
                  <Video className="h-4 w-4 text-accent" />
                  <span className="text-xs font-semibold text-accent">Video Recovery (Recommended)</span>
                </div>
                <p className="text-xs text-muted-foreground mb-2">
                  Record a short selfie clip to recover your account without email/phone.
                </p>
                {videoRecorded ? (
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1 text-success text-xs">
                      <Check className="h-3 w-3" />
                      Video recorded
                    </div>
                    <button
                      type="button"
                      onClick={() => setVideoRecorded(false)}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      Re-record
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setIsRecordingVideo(true)
                      // Simulate recording
                      setTimeout(() => {
                        setIsRecordingVideo(false)
                        setVideoRecorded(true)
                      }, 3000)
                    }}
                    disabled={isRecordingVideo}
                    className="flex items-center gap-2 rounded-lg bg-accent/20 px-3 py-2 text-xs font-medium text-accent hover:bg-accent/30 disabled:opacity-50"
                  >
                    {isRecordingVideo ? (
                      <>
                        <div className="h-2 w-2 rounded-full bg-destructive animate-pulse" />
                        Recording...
                      </>
                    ) : (
                      <>
                        <Camera className="h-3 w-3" />
                        Record Video Selfie
                      </>
                    )}
                  </button>
                )}
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="flex w-full items-center justify-center gap-2 rounded-full bg-primary py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create Account"}
              </button>

              {/* Divider */}
              <div className="relative my-3">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="bg-card px-3 text-muted-foreground">or sign up with</span>
                </div>
              </div>

              {/* Social Sign Up Buttons */}
              <div className="grid grid-cols-3 gap-2">
                {/* Google */}
                <button
                  type="button"
                  onClick={() => {
                    setIsLoading(true)
                    setTimeout(() => {
                      set2faMethod("email")
                      setStep("2fa")
                      setIsLoading(false)
                    }, 1000)
                  }}
                  className="flex items-center justify-center gap-2 rounded-lg border border-border bg-background py-2 text-sm font-medium transition-colors hover:bg-muted"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                </button>

                {/* Apple */}
                <button
                  type="button"
                  onClick={() => {
                    setIsLoading(true)
                    setTimeout(() => {
                      set2faMethod("email")
                      setStep("2fa")
                      setIsLoading(false)
                    }, 1000)
                  }}
                  className="flex items-center justify-center gap-2 rounded-lg border border-border bg-background py-2 text-sm font-medium transition-colors hover:bg-muted"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
                  </svg>
                </button>

                {/* X (Twitter) */}
                <button
                  type="button"
                  onClick={() => {
                    setIsLoading(true)
                    setTimeout(() => {
                      set2faMethod("email")
                      setStep("2fa")
                      setIsLoading(false)
                    }, 1000)
                  }}
                  className="flex items-center justify-center gap-2 rounded-lg border border-border bg-background py-2 text-sm font-medium transition-colors hover:bg-muted"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                  </svg>
                </button>
              </div>
            </form>
          )}

          {/* 2FA Form */}
          {step === "2fa" && (
            <form onSubmit={handleVerify2FA} className="space-y-4">
              <div>
                <label className="mb-2 block text-xs font-medium text-muted-foreground">Select 2FA delivery method</label>
                <div className="space-y-2">
                  <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-border bg-muted/30 p-3 transition-colors hover:bg-muted/50">
                    <input
                      type="radio"
                      name="otpMethod"
                      value="email"
                      checked={otpMethod === "email"}
                      onChange={() => setOtpMethod("email")}
                      className="h-4 w-4 accent-primary"
                    />
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">Email verification code</span>
                  </label>
                  <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-border bg-muted/30 p-3 transition-colors hover:bg-muted/50">
                    <input
                      type="radio"
                      name="otpMethod"
                      value="phone"
                      checked={otpMethod === "phone"}
                      onChange={() => setOtpMethod("phone")}
                      className="h-4 w-4 accent-primary"
                    />
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">Phone/SMS verification code</span>
                  </label>
                </div>
              </div>

              <button
                type="button"
                onClick={handleSendOTP}
                disabled={isLoading || otpSent}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-primary bg-primary/10 py-2.5 text-sm font-semibold text-primary transition-colors hover:bg-primary/20 disabled:opacity-50"
              >
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : otpSent ? <><CheckCircle2 className="h-4 w-4" /> Code Sent!</> : "Send Verification Code"}
              </button>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Enter 6-digit code</label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="Enter code"
                  className="w-full rounded-lg border border-border bg-background py-2.5 px-4 text-center font-mono text-lg tracking-widest outline-none transition-colors focus:border-primary"
                />
              </div>

              {otpSent && <p className="text-center text-xs text-success">Demo mode: Enter any 6-digit code to continue.</p>}

              <button
                type="submit"
                disabled={isLoading}
                className="flex w-full items-center justify-center gap-2 rounded-full bg-primary py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Verify & Enter Dashboard <ArrowRight className="h-4 w-4" /></>}
              </button>

              <button
                type="button"
                onClick={() => { setStep("signin"); setOtpSent(false); setOtpCode("") }}
                className="w-full text-center text-xs text-muted-foreground hover:text-foreground"
              >
                Back to Sign In
              </button>
            </form>
          )}

          {/* Video Recovery Form */}
          {step === "video-recovery" && (
            <div className="space-y-4">
              <div className="text-center">
                <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-accent/20">
                  <Video className="h-8 w-8 text-accent" />
                </div>
                <h3 className="text-lg font-semibold">Video Recovery</h3>
                <p className="text-sm text-muted-foreground">
                  Recover your account using your video selfie
                </p>
              </div>

              {/* Step 1: Record/Verify Video */}
              <div className="rounded-lg border border-border bg-muted/30 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">1</div>
                  <span className="text-sm font-semibold">Verify Your Identity</span>
                </div>
                <p className="text-xs text-muted-foreground mb-3">
                  Record a short video clip facing the camera. We will match it with your registered video.
                </p>
                {videoRecorded ? (
                  <div className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-success" />
                    <span className="text-sm text-success">Video verified successfully</span>
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      setIsRecordingVideo(true)
                      setTimeout(() => {
                        setIsRecordingVideo(false)
                        setVideoRecorded(true)
                      }, 3000)
                    }}
                    disabled={isRecordingVideo}
                    className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-50"
                  >
                    {isRecordingVideo ? (
                      <>
                        <div className="h-2 w-2 rounded-full bg-white animate-pulse" />
                        Recording...
                      </>
                    ) : (
                      <>
                        <Camera className="h-4 w-4" />
                        Start Recording
                      </>
                    )}
                  </button>
                )}
              </div>

              {/* Step 2: Enter Password */}
              <div className={`rounded-lg border border-border bg-muted/30 p-4 ${!videoRecorded ? "opacity-50" : ""}`}>
                <div className="flex items-center gap-2 mb-3">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">2</div>
                  <span className="text-sm font-semibold">Enter Your Password</span>
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="password"
                    value={videoRecoveryPassword}
                    onChange={(e) => setVideoRecoveryPassword(e.target.value)}
                    placeholder="Enter your password"
                    disabled={!videoRecorded}
                    className="w-full rounded-lg border border-border bg-background py-2.5 pl-10 pr-4 text-sm outline-none transition-colors focus:border-primary disabled:opacity-50"
                  />
                </div>
              </div>

              {/* Step 3: Security Question (Optional) */}
              <div className={`rounded-lg border border-border bg-muted/30 p-4 ${!videoRecorded ? "opacity-50" : ""}`}>
                <div className="flex items-center gap-2 mb-3">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-bold">3</div>
                  <span className="text-sm font-semibold">Security Question (Optional)</span>
                </div>
                <p className="text-xs text-muted-foreground mb-2">
                  Answer one of these questions for extra security
                </p>
                <div className="space-y-2 mb-3">
                  {[
                    { id: "balance", label: "What was your last available balance?" },
                    { id: "transaction", label: "What was your last transaction amount?" },
                    { id: "trade", label: "What was your last trade?" },
                  ].map((q) => (
                    <label key={q.id} className="flex cursor-pointer items-center gap-2 rounded-lg border border-border p-2 hover:bg-muted/50">
                      <input
                        type="radio"
                        name="securityQ"
                        checked={securityQuestion === q.id}
                        onChange={() => setSecurityQuestion(q.id as "balance" | "transaction" | "trade")}
                        disabled={!videoRecorded}
                        className="h-3 w-3 accent-primary"
                      />
                      <span className="text-xs">{q.label}</span>
                    </label>
                  ))}
                </div>
                <input
                  type="text"
                  value={videoRecoveryAnswer}
                  onChange={(e) => setVideoRecoveryAnswer(e.target.value)}
                  placeholder="Your answer (optional)"
                  disabled={!videoRecorded}
                  className="w-full rounded-lg border border-border bg-background py-2 px-3 text-sm outline-none transition-colors focus:border-primary disabled:opacity-50"
                />
              </div>

              <button
                onClick={() => {
                  if (videoRecorded && videoRecoveryPassword) {
                    setIsLoading(true)
                    setTimeout(() => {
                      setIsLoading(false)
                      onAuthenticated({
                        email: "recovered@example.com",
                        username: "recovered_user",
                        fullName: "Recovered User",
                        level: TRADING_USER_LEVEL,
                      })
                    }, 2000)
                  }
                }}
                disabled={!videoRecorded || !videoRecoveryPassword || isLoading}
                className="flex w-full items-center justify-center gap-2 rounded-full bg-primary py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Recover Account <ArrowRight className="h-4 w-4" /></>}
              </button>

              <button
                onClick={() => {
                  setStep("signin")
                  setVideoRecorded(false)
                  setVideoRecoveryPassword("")
                  setVideoRecoveryAnswer("")
                }}
                className="w-full text-center text-xs text-muted-foreground hover:text-foreground"
              >
                Back to Sign In
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Floating Joelin button */}
      <button
        onClick={() => setShowAssistant(true)}
        className={`fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-primary to-accent shadow-lg shadow-primary/30 transition-all hover:scale-110 active:scale-95 ${showAssistant ? "opacity-0 pointer-events-none" : "opacity-100"}`}
      >
        <Bot className="h-7 w-7 text-primary-foreground" />
        <span className="absolute -bottom-1 -right-1 h-3 w-3 animate-ping rounded-full bg-success" />
        <span className="absolute -bottom-1 -right-1 h-3 w-3 rounded-full bg-success" />
      </button>

      {/* Joelin popup */}
      {showAssistant && (
        <div className="fixed bottom-4 right-4 z-[100] w-[380px] max-h-[550px] animate-in slide-in-from-bottom-5 slide-in-from-right-5 duration-300 rounded-2xl border border-border bg-card shadow-2xl overflow-hidden flex flex-col">
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
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setShowAssistant(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[200px] max-h-[280px]">
            {assistantMessages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground rounded-br-md"
                      : "bg-muted rounded-bl-md"
                  }`}
                >
                  <p className="text-sm whitespace-pre-line">{msg.content}</p>
                  <p className={`mt-1 text-[10px] ${msg.role === "user" ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                    {msg.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
              </div>
            ))}
            {isAssistantLoading && (
              <div className="flex justify-start">
                <div className="rounded-2xl rounded-bl-md bg-muted px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    <span className="text-sm text-muted-foreground">Thinking...</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Quick Questions */}
          {assistantMessages.length <= 2 && (
            <div className="flex-shrink-0 border-t border-border bg-muted/30 px-4 py-3">
              <p className="mb-2 text-xs font-medium text-muted-foreground">Quick questions:</p>
              <div className="flex flex-wrap gap-2">
                {QUICK_QUESTIONS.map((q, i) => (
                  <button
                    key={i}
                    onClick={() => handleAssistantSubmit(q.query)}
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
              onSubmit={(e) => { e.preventDefault(); handleAssistantSubmit() }}
              className="flex items-center gap-2"
            >
              <input
                type="text"
                value={assistantInput}
                onChange={(e) => setAssistantInput(e.target.value)}
                placeholder="Type your message..."
                disabled={isAssistantLoading}
                className="flex-1 rounded-full border border-border bg-background px-4 py-2.5 text-sm outline-none transition-colors focus:border-primary disabled:opacity-50"
              />
              <Button type="submit" size="icon" disabled={isAssistantLoading || !assistantInput.trim()} className="h-10 w-10 rounded-full">
                <Send className="h-4 w-4" />
              </Button>
            </form>
            <p className="mt-2 text-center text-[10px] text-muted-foreground">
              Joelin · Nexus PRO | Type &quot;human&quot; for live support
            </p>
          </div>
        </div>
      )}

      {/* Instructions Popup - Slides from bottom right */}
      {showInstructions && (
        <div className="fixed bottom-4 right-4 z-[60] w-80 animate-in slide-in-from-bottom-4 duration-300">
          <div className="rounded-xl border border-primary/30 bg-card/95 p-4 shadow-2xl shadow-primary/20 backdrop-blur-sm">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/20">
                  <Sparkles className="h-3 w-3 text-primary" />
                </div>
                <span className="text-sm font-semibold text-primary">Welcome to Nexus Pro</span>
              </div>
              <button
                onClick={() => setShowInstructions(false)}
                className="flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <ul className="space-y-2">
              {INSTRUCTIONS.map((instruction, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                  <CheckCircle2 className="mt-0.5 h-3 w-3 flex-shrink-0 text-primary" />
                  <span>{instruction}</span>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
              <span className="text-[10px] text-muted-foreground">Auto-dismiss in 8s</span>
              <button
                onClick={() => setShowInstructions(false)}
                className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/20"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
