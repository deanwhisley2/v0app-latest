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
    <div className="nexus-toast-stable fixed bottom-20 left-1/2 z-50 max-md:left-4 max-md:right-4 max-md:translate-x-0 md:bottom-6 md:-translate-x-1/2">
      <div
        className={`flex items-center gap-3 rounded-xl border border-border px-5 py-3 font-semibold max-md:shadow-none md:rounded-full md:shadow-lg ${
          type === "success"
            ? "bg-success text-success-foreground md:shadow-success/30"
            : "bg-destructive text-destructive-foreground md:shadow-destructive/30"
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
