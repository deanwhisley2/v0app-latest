# Agent and contributor guardrails

- **Cursor rules (enforced for AI and recommended for humans):** `.cursor/rules/` — especially `supabase-financial-integrity.mdc` (always on) and `supabase-migrations-sql.mdc` when editing `supabase/migrations/**/*.sql`.
- **Supabase product guidance:** `.agents/skills/supabase/SKILL.md` — use for any database, auth, RLS, migrations, or MCP workflow.
- **Migrations:** create with `supabase migration new <snake_case_name>`; ship DDL through the same migration pipeline everywhere (local `supabase db`, CI `supabase db push`, or linked remote Supabase MCP `apply_migration`). Keep `supabase/migrations/**/*.sql` aligned with what is applied to each environment’s Postgres. Runtime is typically PM2 (`ecosystem.config.js`, `npm run start:with-recovery`) or equivalent — set secrets on the host, not in the repo.
