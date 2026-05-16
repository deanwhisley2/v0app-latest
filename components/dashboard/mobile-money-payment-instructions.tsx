"use client"

import {
  CUSTOMER_AIRTEL_MENU_DISPLAY_NAME,
  customerInstructionPayeeDisplay,
} from "@/lib/customer-payment-instruction-display"

const PANEL_CLASS =
  "max-w-full space-y-2 overflow-x-hidden rounded-lg border border-border/70 bg-background/80 p-2.5 sm:p-3"

type AirtelStepsProps = {
  ussdPrefix: string
  merchantId: string
  payerEmail: string
  t: (key: string) => string
}

export function AirtelPaymentSteps({ ussdPrefix, merchantId, payerEmail, t }: AirtelStepsProps) {
  return (
    <details className="rounded-md border border-border/60 bg-muted/20">
      <summary className="cursor-pointer select-none px-2.5 py-2 text-[11px] font-semibold text-foreground">
        {t("funding.payment.airtelStepsToggle")}
      </summary>
      <ol className="list-decimal space-y-1 border-t border-border/50 px-2.5 py-2 pl-5 text-[11px] leading-snug text-foreground break-words">
        <li>{t("funding.payment.airtelStep1").replace("{{ussd}}", ussdPrefix)}</li>
        <li>{t("funding.payment.airtelStep2").replace("{{merchantId}}", merchantId)}</li>
        <li>{t("funding.payment.airtelStep3").replace("{{email}}", payerEmail)}</li>
        <li>{t("funding.payment.airtelStep4")}</li>
        <li>{t("funding.payment.airtelStep5")}</li>
      </ol>
      <p className="border-t border-border/50 px-2.5 py-2 text-[10px] leading-snug text-muted-foreground break-words">
        {t("funding.payment.airtelMenuMayShow").replace("{{name}}", CUSTOMER_AIRTEL_MENU_DISPLAY_NAME)}
      </p>
    </details>
  )
}

type TxRefFieldsProps = {
  fundTxReference: string
  onTxReferenceChange: (v: string) => void
  onTxReferenceBlur?: () => void
  txReferenceError?: string | null
  hint: string
  t: (key: string) => string
}

export function PaymentReferenceFields({
  fundTxReference,
  onTxReferenceChange,
  onTxReferenceBlur,
  txReferenceError,
  hint,
  t,
}: TxRefFieldsProps) {
  return (
    <div className="space-y-1.5">
      <label className="block text-[10px] font-medium text-foreground">{t("funding.payment.refRequired")}</label>
      <p className="text-[10px] leading-snug text-muted-foreground break-words">{hint}</p>
      <input
        type="text"
        inputMode="text"
        autoComplete="off"
        name="momo-tx-id"
        value={fundTxReference}
        onChange={(e) => onTxReferenceChange(e.target.value)}
        onBlur={() => onTxReferenceBlur?.()}
        placeholder={t("funding.txRefPlaceholder")}
        aria-invalid={txReferenceError ? true : undefined}
        className="w-full min-h-[44px] max-w-full rounded-md border-2 border-primary/40 bg-background px-3 py-2 font-mono text-sm outline-none focus:border-primary"
      />
      {txReferenceError ? (
        <p className="text-[10px] font-medium text-destructive break-words" role="alert">
          {txReferenceError}
        </p>
      ) : null}
    </div>
  )
}

type RetailerPaymentInstructionPanelProps = {
  airtel: { ussdPrefix: string; merchantId: string } | null
  instructionPayeeRaw?: string | null
  payerEmail: string
  fundTxReference: string
  onTxReferenceChange: (v: string) => void
  onTxReferenceBlur?: () => void
  txReferenceError?: string | null
  txRefHint: string
  fundNote: string
  onFundNoteChange: (v: string) => void
  t: (key: string) => string
}

export function RetailerPaymentInstructionPanel({
  airtel,
  instructionPayeeRaw,
  payerEmail,
  fundTxReference,
  onTxReferenceChange,
  onTxReferenceBlur,
  txReferenceError,
  txRefHint,
  fundNote,
  onFundNoteChange,
  t,
}: RetailerPaymentInstructionPanelProps) {
  const instructionPayee = customerInstructionPayeeDisplay(instructionPayeeRaw)

  return (
    <div className={PANEL_CLASS}>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {t("funding.payment.instructionPanelTitle")}
      </p>
      {airtel ? (
        <>
          <AirtelPaymentSteps
            ussdPrefix={airtel.ussdPrefix}
            merchantId={airtel.merchantId}
            payerEmail={payerEmail}
            t={t}
          />
          <p className="text-[10px] leading-snug text-muted-foreground break-words">
            {t("funding.payment.registeredPayeeInstruction").replace("{{name}}", instructionPayee)}
          </p>
        </>
      ) : null}
      <PaymentReferenceFields
        fundTxReference={fundTxReference}
        onTxReferenceChange={onTxReferenceChange}
        onTxReferenceBlur={onTxReferenceBlur}
        txReferenceError={txReferenceError}
        hint={txRefHint}
        t={t}
      />
      <div>
        <label className="mb-1 block text-[10px] font-medium text-muted-foreground">{t("funding.optionalMemo")}</label>
        <input
          type="text"
          value={fundNote}
          onChange={(e) => onFundNoteChange(e.target.value)}
          placeholder={t("funding.memoPlaceholder")}
          className="w-full min-h-[44px] rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
      </div>
    </div>
  )
}
