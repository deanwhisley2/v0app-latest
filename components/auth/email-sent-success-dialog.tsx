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
          <DialogTitle>Email Sent Successfully</DialogTitle>
          <DialogDescription className="pt-2 text-left text-sm leading-relaxed text-muted-foreground">
            Please check your Inbox, Spam, Junk, Promotions, and Updates folders. Some email
            providers may automatically filter verification emails.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" className="min-h-11 w-full sm:w-auto" onClick={() => onOpenChange(false)}>
            OK
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
