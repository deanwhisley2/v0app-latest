# Agent and contributor guardrails

- **Cursor rules (enforced for AI and recommended for humans):** `.cursor/rules/` — especially `supabase-financial-integrity.mdc` (always on) and `supabase-migrations-sql.mdc` when editing `supabase/migrations/**/*.sql`.
- **Supabase product guidance:** `.agents/skills/supabase/SKILL.md` — use for any database, auth, RLS, migrations, or MCP workflow.
- **Migrations:** create with `supabase migration new <snake_case_name>`; ship DDL through the same migration pipeline the project uses (local `supabase db` / linked remote MCP `apply_migration`). Keep repo SQL in sync with what is applied remotely.
