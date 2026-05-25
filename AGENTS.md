# Agent and contributor guardrails

- **Cursor rules (enforced for AI and recommended for humans):** `.cursor/rules/` — especially `supabase-financial-integrity.mdc` (always on), `deployment-completion.mdc` (always on — full deploy closure), `nexus-master-evolution.mdc` (always on — institutional evolution without breaking routing/scroll baseline), `localization.mdc` (always on — UI-only i18n vs canonical ledger English), `market-price-authority.mdc` (always on — canonical customer-visible spot pricing), and `supabase-migrations-sql.mdc` when editing `supabase/migrations/**/*.sql`.
- **Master product direction:** `docs/NEXUS_MASTER_EVOLUTION.md` — phased brand, motion, LOW_GPU, header, PWA/APK policy.
- **Supabase product guidance:** `.agents/skills/supabase/SKILL.md` — use for any database, auth, RLS, migrations, or MCP workflow.
- **Migrations:** create with `supabase migration new <snake_case_name>`; ship DDL through the same migration pipeline everywhere (local `supabase db`, CI `supabase db push`, or linked remote Supabase MCP `apply_migration`). Keep `supabase/migrations/**/*.sql` aligned with what is applied to each environment’s Postgres. Runtime is typically PM2 (`ecosystem.config.js`, `npm run start:with-recovery`) or equivalent — set secrets on the host, not in the repo.

## Deployment completion (production parity)

Implementation is not complete until production runtime matches the merged code path, when the environment already has Git, SSH, and deploy scripts.

**Every slice should close with:**

1. **Migrations** — If the slice changed schema, RLS, RPC, or ledger-related SQL: new migration + apply via the project’s Supabase pipeline; if **no** DB change, record “migration check: N/A” explicitly.
2. **Git** — Commit with a clear message; push to `main` (or the agreed release branch).
3. **VPS** — From a clone with `.git`: `bash scripts/deploy-vps-git-archive.sh` (archives `HEAD`, extracts to `/opt/nexus-pro`, runs `scripts/deploy.sh`).
4. **PM2** — Deploy script restarts the `nexus` app; confirm process online.
5. **Health** — e.g. `https://nexuspro.it.com/api/health` returns 200 (allow a short warm-up after restart).
6. **Production spot-check** — Any slice-specific route or UI behavior on the live domain when applicable.
7. **Mobile** — If the slice changed responsive UI, verify on at least one real handset or document as pending device QA.
8. **Report** — Short PASS/FAIL note: commit hash, migrations (or N/A), deploy result, health, remaining risks, rollback (re-deploy prior known-good `DEPLOY_REF=<sha> bash scripts/deploy-vps-git-archive.sh`).

**Do not stop at “code done”** when deploy access exists; only stop on a real blocker (auth, failing build, migration conflict, health failure), and say so in the report.

**Bounded slices** — Keep UI-only, accounting, persistence, and simulation work in separate changesets with their own DB/payout/persistence sections in the report (see `.cursor/rules/deployment-completion.mdc`).
