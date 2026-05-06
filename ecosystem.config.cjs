/**
 * Legacy server path preset. Prefer repo `ecosystem.config.js`:
 * `npm run start:with-recovery` runs reconciliation before `next start`.
 */
module.exports = {
  apps: [
    {
      name: "nexus-pro",
      cwd: "/var/www/nexus-pro",
      script: "npm",
      args: "run start:with-recovery",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "500M",
      env: {
        NODE_ENV: "production",
        PORT: "3000"
      }
    }
  ]
}
