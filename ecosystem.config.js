/**
 * PM2: set env on the host before `pm2 start` (e.g. `export $(grep -v '^#' .env.production | xargs)`)
 * or the process.env values below are undefined at load time.
 */
module.exports = {
  apps: [
    {
      name: "nexus",
      cwd: __dirname,
      script: "npm",
      args: "start",
      env: {
        NODE_ENV: "production",
        BREVO_API_KEY: process.env.BREVO_API_KEY,
        BREVO_SENDER_EMAIL: process.env.BREVO_SENDER_EMAIL,
        BREVO_SENDER_NAME: process.env.BREVO_SENDER_NAME,
        NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
      },
    },
  ],
}
