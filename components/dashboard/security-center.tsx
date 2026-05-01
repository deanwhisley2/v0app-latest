"use client"

import { useState, useEffect } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Shield,
  Lock,
  Unlock,
  Check,
  X,
  AlertTriangle,
  Video,
  Camera,
  Fingerprint,
  Key,
  Smartphone,
  Mail,
  Eye,
  EyeOff,
  ChevronRight,
  Info,
  Bell,
  Loader2,
} from "lucide-react"

interface SecurityLevel {
  level: 1 | 2 | 3
  name: string
  description: string
  features: string[]
  unlocks: string[]
  requirements: string[]
  completed: boolean
}

interface SecurityCenterProps {
  currentLevel: 1 | 2 | 3
  onLevelChange: (level: 1 | 2 | 3) => void
}

export function SecurityCenter({ currentLevel, onLevelChange }: SecurityCenterProps) {
  const [activeSetup, setActiveSetup] = useState<1 | 2 | 3 | null>(null)
  const [setupStep, setSetupStep] = useState(1)
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [videoRecorded, setVideoRecorded] = useState(false)
  const [pin, setPin] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [showReminder, setShowReminder] = useState(false)

  const securityLevels: SecurityLevel[] = [
    {
      level: 1,
      name: "Basic Security",
      description: "Email and password authentication",
      features: ["Email verification", "Password protection", "2FA via email/SMS"],
      unlocks: ["Trading", "Viewing balance", "Market data"],
      requirements: ["Email verified", "Password set", "2FA enabled"],
      completed: currentLevel >= 1,
    },
    {
      level: 2,
      name: "Enhanced Security",
      description: "Video selfie and security questions",
      features: ["Video selfie verification", "Security questions", "Account recovery"],
      unlocks: ["Deposits from own accounts", "Internal transfers", "API access"],
      requirements: ["Video selfie recorded", "Security questions set"],
      completed: currentLevel >= 2,
    },
    {
      level: 3,
      name: "Maximum Security",
      description: "Full withdrawal and external transfer access",
      features: ["Withdrawal PIN", "Biometric option", "Trusted devices"],
      unlocks: ["Withdrawals to any account", "External deposits", "High-limit transactions"],
      requirements: ["6-digit PIN set", "ID verification pending"],
      completed: currentLevel >= 3,
    },
  ]

  // Show reminder for users without Level 3
  useEffect(() => {
    if (currentLevel < 3) {
      const timer = setTimeout(() => setShowReminder(true), 5000)
      return () => clearTimeout(timer)
    }
  }, [currentLevel])

  const handleCompleteLevel = (level: 1 | 2 | 3) => {
    setIsLoading(true)
    setTimeout(() => {
      onLevelChange(level)
      setActiveSetup(null)
      setSetupStep(1)
      setPassword("")
      setConfirmPassword("")
      setPin("")
      setVideoRecorded(false)
      setIsLoading(false)
    }, 2000)
  }

  const renderSetupModal = () => {
    if (!activeSetup) return null

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <Card className="w-full max-w-md max-h-[90vh] overflow-y-auto p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">
              Setup Level {activeSetup} Security
            </h3>
            <button onClick={() => setActiveSetup(null)} className="text-muted-foreground hover:text-foreground">
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Level 2 Setup - Video Selfie */}
          {activeSetup === 2 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-4">
                {[1, 2].map((s) => (
                  <div
                    key={s}
                    className={`h-2 flex-1 rounded-full ${
                      setupStep >= s ? "bg-primary" : "bg-muted"
                    }`}
                  />
                ))}
              </div>

              {setupStep === 1 && (
                <div className="space-y-4">
                  <div className="text-center">
                    <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-accent/20">
                      <Video className="h-8 w-8 text-accent" />
                    </div>
                    <h4 className="font-semibold">Record Video Selfie</h4>
                    <p className="text-sm text-muted-foreground">
                      This video will be used for account recovery
                    </p>
                  </div>

                  <div className="rounded-lg border border-dashed border-border p-8 text-center">
                    {videoRecorded ? (
                      <div className="space-y-2">
                        <Check className="mx-auto h-12 w-12 text-success" />
                        <p className="text-success font-medium">Video Recorded!</p>
                        <button
                          onClick={() => setVideoRecorded(false)}
                          className="text-xs text-muted-foreground hover:text-foreground"
                        >
                          Re-record
                        </button>
                      </div>
                    ) : isRecording ? (
                      <div className="space-y-2">
                        <div className="mx-auto h-12 w-12 rounded-full bg-destructive animate-pulse" />
                        <p className="text-sm">Recording... Look at the camera</p>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setIsRecording(true)
                          setTimeout(() => {
                            setIsRecording(false)
                            setVideoRecorded(true)
                          }, 3000)
                        }}
                        className="flex flex-col items-center gap-2"
                      >
                        <Camera className="h-12 w-12 text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">Tap to record</span>
                      </button>
                    )}
                  </div>

                  <Button
                    onClick={() => setSetupStep(2)}
                    disabled={!videoRecorded}
                    className="w-full"
                  >
                    Continue <ChevronRight className="h-4 w-4 ml-2" />
                  </Button>
                </div>
              )}

              {setupStep === 2 && (
                <div className="space-y-4">
                  <h4 className="font-semibold">Set Security Questions</h4>
                  <p className="text-sm text-muted-foreground">
                    These questions help verify your identity during recovery
                  </p>

                  <div className="space-y-3">
                    <div>
                      <label className="text-xs text-muted-foreground">Last known balance</label>
                      <Input placeholder="Enter approximate amount" />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Last transaction amount</label>
                      <Input placeholder="Enter approximate amount" />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Last traded coin</label>
                      <Input placeholder="e.g., BTC, ETH" />
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setSetupStep(1)} className="flex-1">
                      Back
                    </Button>
                    <Button onClick={() => handleCompleteLevel(2)} disabled={isLoading} className="flex-1">
                      {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Complete Setup"}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Level 3 Setup - PIN and ID */}
          {activeSetup === 3 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-4">
                {[1, 2].map((s) => (
                  <div
                    key={s}
                    className={`h-2 flex-1 rounded-full ${
                      setupStep >= s ? "bg-primary" : "bg-muted"
                    }`}
                  />
                ))}
              </div>

              {setupStep === 1 && (
                <div className="space-y-4">
                  <div className="text-center">
                    <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-primary/20">
                      <Key className="h-8 w-8 text-primary" />
                    </div>
                    <h4 className="font-semibold">Create Withdrawal PIN</h4>
                    <p className="text-sm text-muted-foreground">
                      This 6-digit PIN is required for all withdrawals
                    </p>
                  </div>

                  <div>
                    <label className="text-xs text-muted-foreground">6-Digit PIN</label>
                    <Input
                      type="password"
                      maxLength={6}
                      value={pin}
                      onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                      placeholder="Enter 6-digit PIN"
                      className="text-center text-lg tracking-widest"
                    />
                  </div>

                  <div>
                    <label className="text-xs text-muted-foreground">Confirm PIN</label>
                    <Input
                      type="password"
                      maxLength={6}
                      placeholder="Confirm your PIN"
                      className="text-center text-lg tracking-widest"
                    />
                  </div>

                  <Button
                    onClick={() => setSetupStep(2)}
                    disabled={pin.length !== 6}
                    className="w-full"
                  >
                    Continue <ChevronRight className="h-4 w-4 ml-2" />
                  </Button>
                </div>
              )}

              {setupStep === 2 && (
                <div className="space-y-4">
                  <div className="rounded-lg bg-warning/10 border border-warning/30 p-4">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="h-5 w-5 text-warning mt-0.5" />
                      <div>
                        <h4 className="font-semibold text-warning">Important</h4>
                        <p className="text-sm text-muted-foreground">
                          Level 3 security enables withdrawals to any account. Make sure to keep your PIN secure.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <h4 className="font-semibold">What you can do with Level 3:</h4>
                    <ul className="space-y-1">
                      {securityLevels[2].unlocks.map((item, i) => (
                        <li key={i} className="flex items-center gap-2 text-sm">
                          <Check className="h-4 w-4 text-success" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setSetupStep(1)} className="flex-1">
                      Back
                    </Button>
                    <Button onClick={() => handleCompleteLevel(3)} disabled={isLoading} className="flex-1">
                      {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Activate Level 3"}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Security Reminder Notification */}
      {showReminder && currentLevel < 3 && (
        <Card className="border-warning/30 bg-warning/5 p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-warning/20">
              <Bell className="h-5 w-5 text-warning" />
            </div>
            <div className="flex-1">
              <h4 className="font-semibold text-warning">Complete Your Security Setup</h4>
              <p className="text-sm text-muted-foreground">
                Enable Level 3 security to unlock withdrawals and external transfers. It only takes 2 minutes!
              </p>
              <div className="mt-2 flex gap-2">
                <Button size="sm" onClick={() => setActiveSetup(currentLevel < 2 ? 2 : 3)}>
                  Setup Now
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setShowReminder(false)}>
                  Later
                </Button>
              </div>
            </div>
            <button onClick={() => setShowReminder(false)} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
        </Card>
      )}

      {/* Current Security Level */}
      <Card className="border-primary/30 bg-gradient-to-br from-primary/10 to-accent/10 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/20">
              <Shield className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Current Security Level</p>
              <p className="text-xl font-bold">Level {currentLevel}</p>
            </div>
          </div>
          <div className="flex gap-1">
            {[1, 2, 3].map((level) => (
              <div
                key={level}
                className={`h-3 w-8 rounded-full ${
                  level <= currentLevel ? "bg-primary" : "bg-muted"
                }`}
              />
            ))}
          </div>
        </div>
      </Card>

      {/* Security Levels */}
      <div className="space-y-3">
        {securityLevels.map((level) => (
          <Card
            key={level.level}
            className={`p-4 ${
              level.completed
                ? "border-success/30 bg-success/5"
                : level.level === currentLevel + 1
                ? "border-primary/30"
                : "opacity-60"
            }`}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3">
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-full ${
                    level.completed
                      ? "bg-success/20 text-success"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {level.completed ? (
                    <Check className="h-5 w-5" />
                  ) : level.level === 1 ? (
                    <Lock className="h-5 w-5" />
                  ) : level.level === 2 ? (
                    <Video className="h-5 w-5" />
                  ) : (
                    <Key className="h-5 w-5" />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="font-semibold">Level {level.level}: {level.name}</h4>
                    {level.completed && (
                      <span className="rounded-full bg-success/20 px-2 py-0.5 text-[10px] font-semibold text-success">
                        COMPLETE
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">{level.description}</p>

                  <div className="mt-2 space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">Unlocks:</p>
                    <div className="flex flex-wrap gap-1">
                      {level.unlocks.map((item, i) => (
                        <span
                          key={i}
                          className="rounded bg-muted px-2 py-0.5 text-[10px]"
                        >
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {!level.completed && level.level === currentLevel + 1 && (
                <Button size="sm" onClick={() => setActiveSetup(level.level)}>
                  Setup
                </Button>
              )}
            </div>
          </Card>
        ))}
      </div>

      {renderSetupModal()}
    </div>
  )
}
