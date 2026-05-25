"use client"

import { Component, type ErrorInfo, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { reportClientDiagnostic } from "@/lib/mobile/mobile-navigation-diagnostics"

type Props = { children: ReactNode; panel: string; onReset?: () => void }

type State = { error: Error | null }

/** Isolates chat/settings chunk failures so the whole dashboard does not hard-crash on Chrome Android. */
export class DashboardPanelErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    reportClientDiagnostic({
      kind: "panel_error_boundary",
      message: error.message.slice(0, 500),
      meta: { panel: this.props.panel, componentStack: info.componentStack?.slice(0, 600) },
    })
  }

  render() {
    if (this.state.error) {
      return (
        <div className="mx-auto max-w-lg rounded-2xl border border-destructive/30 bg-card p-6 text-center">
          <p className="text-sm font-semibold text-foreground">This section could not load</p>
          <p className="mt-2 text-xs text-muted-foreground">
            {this.props.panel} failed on this device. Return to Home and try again.
          </p>
          <div className="mt-4 flex flex-col gap-2">
            <Button
              type="button"
              className="w-full touch-manipulation"
              onClick={() => {
                this.setState({ error: null })
                this.props.onReset?.()
              }}
            >
              Try again
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full touch-manipulation"
              onClick={() => {
                window.location.href = "/dashboard"
              }}
            >
              Back to dashboard
            </Button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
