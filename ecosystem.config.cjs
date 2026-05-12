/**
 * Legacy alternate PM2 name (`nexus-pro`). Prefer repo `ecosystem.config.js` (`nexus`).
 * `cwd` follows this file so deploy works at /opt/nexus-pro or any clone path.
 */
module.exports = {
  apps: [
    {
      name: "nexus-pro",
      cwd: __dirname,
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
