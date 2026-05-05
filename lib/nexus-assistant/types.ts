/**
 * In-app Joelin guide — no user secrets, no data above the caller's level.
 * Local draft from `runNexusAssistant` anchors DeepSeek when configured.
 */

export type NexusAssistantSurface =
  | "auth_screen"
  | "settings_learner"
  | "floating_login"
  | "floating_dashboard"
  | "dashboard_wallstreet_assistant"
  | "bottom_nav_mini"

export type NexusAssistantAuthStep =
  | "signin"
  | "signup"
  | "2fa"
  | "forgot-password"
  | "reset-password"
  | "video-recovery"

export type NexusAssistantInput = {
  userMessage: string
  surface: NexusAssistantSurface
  /** App trading tier (from profile when wired; constant until then). */
  tradingUserLevel: number
  isGuest: boolean
  authStep?: NexusAssistantAuthStep | string
  /** Desk symbol when user is on Wallstreet / trade context. */
  focusSymbol?: string
}
