"use client"

import { useCallback, useMemo, useState } from "react"
import { supabase } from "@/lib/supabaseClient"
import type { NexusNotificationItem } from "@/lib/nexus-notification-models"
import {
  buildCryptoDepositReceipt,
  buildFinancialEventFallbackReceipt,
  buildFinancialEventReceipt,
  buildNotificationFallbackReceipt,
  buildWithdrawalReceipt,
  extractNotificationReceiptLink,
  fetchDepositForReceipt,
  fetchWithdrawalForReceipt,
  isFinancialReceiptNotification,
  type CryptoDepositReceiptRow,
  type FinancialEventReceiptRow,
  type TransactionReceipt,
  type WithdrawalReceiptRow,
} from "@/lib/transactions/transaction-receipt-model"
import { presentFinancialEventForCustomer } from "@/lib/notifications/financial-event-presenter"
import { presentNotification } from "@/lib/notifications/notification-inbox-presenter"
import type { NotificationViewerCorridor } from "@/lib/customer-corridor-money"

export function useTransactionReceiptOpener(
  t: (key: string) => string,
  viewer?: NotificationViewerCorridor,
) {
  const [receipt, setReceipt] = useState<TransactionReceipt | null>(null)
  const [open, setOpen] = useState(false)

  const closeReceipt = useCallback(() => {
    setOpen(false)
    setReceipt(null)
  }, [])

  const showReceipt = useCallback((r: TransactionReceipt) => {
    setReceipt(r)
    setOpen(true)
  }, [])

  const openWithdrawal = useCallback(
    (row: WithdrawalReceiptRow) => {
      showReceipt(buildWithdrawalReceipt(row))
    },
    [showReceipt],
  )

  const openDeposit = useCallback(
    (row: CryptoDepositReceiptRow) => {
      showReceipt(buildCryptoDepositReceipt(row))
    },
    [showReceipt],
  )

  const openFinancialEvent = useCallback(
    (row: FinancialEventReceiptRow) => {
      const built = buildFinancialEventReceipt(row)
      if (built) {
        showReceipt(built)
        return
      }
      const p = presentFinancialEventForCustomer(row)
      showReceipt(buildFinancialEventFallbackReceipt(row, p.title, p.detailLine))
    },
    [showReceipt],
  )

  const openNotification = useCallback(
    async (n: NexusNotificationItem) => {
      if (!isFinancialReceiptNotification(n)) {
        const p = presentNotification(n, t, viewer)
        showReceipt(buildNotificationFallbackReceipt(n, p.title, p.summary))
        return
      }

      const {
        data: { session },
      } = await supabase.auth.getSession()
      const token = session?.access_token
      const link = extractNotificationReceiptLink(n)

      if (token && link?.requestId && (link.sourceKind === "withdrawal_request" || link.requestId)) {
        const row = await fetchWithdrawalForReceipt(link.requestId, token)
        if (row) {
          showReceipt(buildWithdrawalReceipt(row))
          return
        }
      }

      if (token && link?.sourceId && link.sourceKind?.includes("crypto_deposit")) {
        const row = await fetchDepositForReceipt(link.sourceId, token)
        if (row) {
          showReceipt(buildCryptoDepositReceipt(row))
          return
        }
      }

      const p = presentNotification(n, t, viewer)
      showReceipt(buildNotificationFallbackReceipt(n, p.title, p.detail || p.summary))
    },
    [showReceipt, t, viewer],
  )

  return useMemo(
    () => ({
      receipt,
      receiptOpen: open,
      closeReceipt,
      showReceipt,
      openWithdrawal,
      openDeposit,
      openFinancialEvent,
      openNotification,
    }),
    [
      receipt,
      open,
      closeReceipt,
      showReceipt,
      openWithdrawal,
      openDeposit,
      openFinancialEvent,
      openNotification,
    ],
  )
}
