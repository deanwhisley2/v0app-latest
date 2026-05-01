module.exports = {
  apps: [
    {
      name: "nexus-pro",
      cwd: "/var/www/nexus-pro",
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3000",
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
