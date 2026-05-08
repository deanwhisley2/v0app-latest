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
        NODE_OPTIONS: "--max-old-space-size=512",
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
    /**
     * Observational learning window: analysis + governance probe + shadow sandbox only (no live orders).
     * Set OBSERVATION_UNTIL (ISO8601), NEXUS_EXPERT_FALLBACK_USER_ID, optional OBSERVATION_SYMBOLS / OBSERVATION_INTERVAL_MS.
     */
    {
      name: "nexus-observation-window",
      cwd: __dirname,
      script: "node_modules/tsx/dist/cli.mjs",
      args: "scripts/observation-window.ts",
      autorestart: false,
      env: {
        NODE_ENV: "production",
      },
    },
    /**
     * Permanent Focus-20 observer: always-on behavior analysis (no forced trades).
     */
    {
      name: "nexus-focus-observer",
      cwd: __dirname,
      script: "node_modules/tsx/dist/cli.mjs",
      args: "scripts/focus-20-observer-daemon.ts",
      autorestart: true,
      max_restarts: 50,
      min_uptime: "15s",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
}
