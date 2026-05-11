/**
 * PM2 runs `npm start` from this repo root. Next.js loads `.env.local` / `.env` itself.
 * Production/staging: set the same secrets the app expects (see `.env.local.example`) on the host
 * (e.g. `pm2 ecosystem` env block, systemd `Environment=`, Docker `env_file`) — not vendor-specific.
 * Do not inject empty Brevo/Supabase vars here — that can block keys that only exist in `.env.local`.
 *
 * Consolidated runtime: only the Next.js app. Legacy daemons (auto-trader, observation, focus observer)
 * were removed — use NEXUS_CHATGPT backup if you need to inspect old scripts.
 */
module.exports = {
  apps: [
    {
      name: "nexus",
      cwd: __dirname,
      script: "npm",
      /** Reconciliation + gate before Next binds PORT — requires NEXUS_EXPERT_FALLBACK_USER_ID / Supabase keys in env. */
      args: "run start:with-recovery",
      env: {
        NODE_ENV: "production",
        NODE_OPTIONS: "--max-old-space-size=512",
      },
    },
  ],
}
