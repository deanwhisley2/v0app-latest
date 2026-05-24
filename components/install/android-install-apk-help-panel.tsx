type AndroidInstallApkHelpPanelProps = {
  open: boolean
}

/** How to sideload the APK — static copy, inline only. */
export function AndroidInstallApkHelpPanel({ open }: AndroidInstallApkHelpPanelProps) {
  if (!open) return null

  return (
    <div
      className="mt-3 space-y-2 rounded-lg border border-border/60 bg-muted/30 p-3 text-[11px] leading-relaxed text-muted-foreground"
      role="note"
    >
      <p className="font-medium text-foreground">How to install the APK</p>
      <ol className="list-decimal space-y-1 pl-4">
        <li>Tap Download Nexus APK and wait for the file to finish.</li>
        <li>Open your Downloads folder or the notification shade.</li>
        <li>Tap the Nexus Pro APK file to install.</li>
        <li>If prompted, allow installs from this browser or enable unknown sources once.</li>
        <li>Open Nexus Pro from your app drawer after install completes.</li>
      </ol>
    </div>
  )
}
