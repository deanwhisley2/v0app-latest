"use client"

import Link from "next/link"
import { useMemo } from "react"
import { useParams } from "next/navigation"
import { ArrowLeft, ShieldAlert, TrendingUp } from "lucide-react"
import { getExpertAnalysisById } from "@/lib/expert-analysis-store"

function describeSafety(action: "BUY" | "SELL" | "HOLD", confidence: number) {
  if (action === "HOLD" || confidence < 45) return "UNSAFE"
  if (confidence < 70) return "RISKY"
  return "SAFE"
}

export default function ExpertAnalysisDetailsPage() {
  const params = useParams<{ analysisId: string }>()
  const analysisId = params?.analysisId ?? ""
  const record = useMemo(() => getExpertAnalysisById(analysisId), [analysisId])

  if (!record) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <Link href="/bot-commander" className="mb-4 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary">
          <ArrowLeft className="h-4 w-4" />
          Back
        </Link>
        <div className="rounded-xl border border-border p-6">
          <p className="font-semibold">Analysis record not found.</p>
          <p className="mt-2 text-sm text-muted-foreground">Run a new analysis and open it from notifications.</p>
        </div>
      </main>
    )
  }

  const safety = describeSafety(record.action, record.confidence)

  return (
    <main className="mx-auto max-w-3xl p-6">
      <Link href="/bot-commander" className="mb-4 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary">
        <ArrowLeft className="h-4 w-4" />
        Back to commander
      </Link>

      <section className="rounded-xl border border-border p-6">
        <h1 className="text-xl font-semibold">Analysis Complete: {record.symbol}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {record.action} with {record.confidence}% confidence
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-border p-3">
            <p className="text-xs text-muted-foreground">Safety assessment</p>
            <p className="mt-1 font-semibold">{safety}</p>
          </div>
          <div className="rounded-lg border border-border p-3">
            <p className="text-xs text-muted-foreground">Entry price</p>
            <p className="mt-1 font-semibold">{record.entryPrice ? `$${record.entryPrice}` : "N/A"}</p>
          </div>
          <div className="rounded-lg border border-border p-3 sm:col-span-2">
            <p className="text-xs text-muted-foreground">Risk assessment</p>
            <p className="mt-1 text-sm">{record.riskAssessment}</p>
          </div>
          <div className="rounded-lg border border-border p-3 sm:col-span-2">
            <p className="text-xs text-muted-foreground">Key indicators</p>
            <ul className="mt-1 list-disc space-y-1 pl-4 text-sm">
              {record.keyIndicators.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <Link href="/dashboard" className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground">
            <TrendingUp className="h-4 w-4" />
            Enter Trade
          </Link>
          <Link href="/bot-commander" className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
            <ShieldAlert className="h-4 w-4" />
            Delete / ignore
          </Link>
        </div>
      </section>
    </main>
  )
}
