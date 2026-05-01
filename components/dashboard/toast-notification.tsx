"use client"

import { useEffect, useState, useCallback } from "react"

import { CheckCircle, XCircle, X } from "lucide-react"

interface ToastProps {
  message: string
  type: "success" | "error"
  isVisible: boolean
  onClose: () => void
}

export function ToastNotification({ message, type, isVisible, onClose }: ToastProps) {
  useEffect(() => {
    if (isVisible) {
      const timer = setTimeout(onClose, 3000)
      return () => clearTimeout(timer)
    }
  }, [isVisible, onClose])

  if (!isVisible) return null

  return (
    <div
      className={`fixed bottom-6 left-1/2 z-50 -translate-x-1/2 transform transition-all duration-300 ${
        isVisible ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
      }`}
    >
      <div
        className={`flex items-center gap-3 rounded-full px-5 py-3 font-semibold shadow-lg ${
          type === "success"
            ? "bg-success text-success-foreground shadow-success/30"
            : "bg-destructive text-destructive-foreground shadow-destructive/30"
        }`}
      >
        {type === "success" ? (
          <CheckCircle className="h-5 w-5" />
        ) : (
          <XCircle className="h-5 w-5" />
        )}
        <span className="text-sm">{message}</span>
        <button onClick={onClose} className="ml-2 hover:opacity-80">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

// Toast hook for easy usage
export function useToast() {
  const [toast, setToast] = useState<{
    message: string
    type: "success" | "error"
    isVisible: boolean
  }>({
    message: "",
    type: "success",
    isVisible: false,
  })

  const showToast = useCallback((message: string, type: "success" | "error" = "success") => {
    setToast({ message, type, isVisible: true })
  }, [])

  const hideToast = useCallback(() => {
    setToast((prev) => ({ ...prev, isVisible: false }))
  }, [])


  return { toast, showToast, hideToast }
}
