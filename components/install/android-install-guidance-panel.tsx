type AndroidInstallGuidancePanelProps = {
  open: boolean
}

/** Inline install help — no portal, blur, scroll lock, or async logic. */
export function AndroidInstallGuidancePanel({ open }: AndroidInstallGuidancePanelProps) {
  if (!open) return null

  return (
    <div
      className="mt-3 space-y-2 rounded-lg border border-border/60 bg-muted/30 p-3 text-[11px] leading-relaxed text-muted-foreground"
      role="note"
    >
      <p className="font-medium text-foreground">Add to Home Screen</p>
      <p>
        <strong>Chrome:</strong> Menu (⋮) → Install app, or Add to Home screen.
      </p>
      <p>
        <strong>Samsung Internet:</strong> Menu → Add page to → Home screen.
      </p>
      <p>
        <strong>Firefox:</strong> Menu (⋮) → Install, or Add to Home screen.
      </p>
      <p className="text-[10px] text-muted-foreground/80">
        Use Download Nexus APK for the official signed package when available.
      </p>
    </div>
  )
}
