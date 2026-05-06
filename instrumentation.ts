/**
 * Next.js instrumentation hook — runs once when the Node server runtime starts.
 * Optional startup recovery orchestration when STARTUP_ORCHESTRATE_INSTRUMENTATION=1.
 *
 * Prefer also running `npm run start:with-recovery` (PM2) so reconciliation
 * completes before `next start` binds the port — this hook is a second line of defense for
 * deployments that omit the wrapper script.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return
  if (process.env.STARTUP_ORCHESTRATE_INSTRUMENTATION !== "1") return

  const userId = process.env.NEXUS_EXPERT_FALLBACK_USER_ID?.trim()
  if (!userId) {
    console.warn("[startup-recovery-instrumentation] skipped: NEXUS_EXPERT_FALLBACK_USER_ID unset")
    return
  }

  try {
    const { orchestrateStartupRecovery } = await import("./lib/startup-recovery")
    const result = await orchestrateStartupRecovery({
      userId,
      autoRepair: process.env.STARTUP_RECOVERY_AUTO_REPAIR === "1",
      maxAgeMinutes: Number(process.env.STARTUP_RECOVERY_MAX_AGE_MINUTES ?? "30"),
    })
    console.log(
      `[startup-recovery-instrumentation] gate=${result.gate} unresolved=${result.unresolvedCount} releasedLocks=${result.releasedLocks}`,
    )
  } catch (e) {
    console.error("[startup-recovery-instrumentation] failed — leaving gate/state unchanged:", e instanceof Error ? e.message : e)
  }
}
