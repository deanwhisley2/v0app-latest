"use client"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function EmailSentSuccessDialog({ open, onOpenChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Verification code sent</DialogTitle>
          <DialogDescription className="pt-2 text-left text-sm leading-relaxed text-muted-foreground">
            Your code is on its way. Verification emails usually arrive within 1 minute.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" className="min-h-12 w-full sm:w-auto" onClick={() => onOpenChange(false)}>
            Continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
