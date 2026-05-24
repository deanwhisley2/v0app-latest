type AndroidInstallPostDownloadHelperProps = {
  open: boolean
}

/** Inline post-download guidance — no portal, scroll lock, or listeners. */
export function AndroidInstallPostDownloadHelper({ open }: AndroidInstallPostDownloadHelperProps) {
  if (!open) return null

  return (
    <div
      className="mt-3 space-y-1.5 rounded-lg border border-primary/25 bg-primary/5 px-3 py-2.5 text-[11px] leading-relaxed text-muted-foreground"
      role="status"
    >
      <p className="font-medium text-foreground">Open Downloads to install Nexus Pro APK.</p>
      <p>
        <strong>Samsung:</strong> Pull down notifications or open My Files → Downloads, then tap the
        Nexus Pro file.
      </p>
      <p>
        <strong>Unknown sources:</strong> If Android asks, allow this browser to install apps once —
        then return to Downloads and tap the APK again.
      </p>
    </div>
  )
}
