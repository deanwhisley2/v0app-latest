/**
 * PM2 runs `npm start` from this repo root. Next.js loads `.env.local` / `.env` itself.
 * Do not inject empty Brevo/Supabase vars here — that can block keys that only exist in `.env.local`.
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
      },
    },
    /**
     * Autonomous trader: HTTP client to local Next (AUTO_TRADER_API_BASE).
     * Requires `npm install` (tsx in devDependencies). Loads .env.local from cwd.
     */
    {
      name: "nexus-auto-trader",
      cwd: __dirname,
      script: "node_modules/tsx/dist/cli.mjs",
      args: "scripts/auto-trader-daemon.ts",
      autorestart: true,
      max_restarts: 30,
      min_uptime: "15s",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
}
