# Git commit & deploy — step-by-step

Use this from the repo root (`/home/whisley2/Downloads/v0app_latest` or your clone path).

---

## 1. Know what you are committing

```bash
cd /path/to/v0app_latest
git status
git diff --stat
```

- **If** you see unrelated changes mixed with operational work: either commit them separately (recommended) or stash what you want to postpone:

```bash
git stash push -m "wip: other feature" path/to/files...
# commit only ops files then
git stash pop
```

---

## 2. Review the diff

```bash
git diff              # unstaged changes
git diff --cached     # after staging — see Section 4
```

Skim security: no `.env`, `.env.local`, keys, secrets, tokens in commits.

---

## 3. Run quick checks (optional but good)

```bash
npm run lint              # if you use eslint in CI
npm run build             # catches many Next breakage before push
npm run operational:smoke # on a machine with .env.local + Supabase (+ optional gate SAFE)
```

If `build` or smoke fails on **this** laptop, decide: fix → commit → push; or push only after fixing on branch.

---

## 4. Stage files

**Option A — everything currently modified:**

```bash
git add -A
```

**Option B — only specific paths (recommended for clean history):**

```bash
git add lib/market-state-authority.ts lib/global-execution-governor.ts app/api/expert/analyze/route.ts
# …add each path you intend to ship…
git status
```

---

## 5. Write the commit message

Conventional shape:

```
<type>(scope): short imperative summary (~50 chars)

Optional body: what changed and why. Link issues if needed.
```

Examples:

- `fix(ops): ensure PM2 starts after reconcile-on-start`
- `feat(ops): add operational smoke check script`

Create the commit:

```bash
git commit -m "feat(ops): your summary here"
# or multi-line:
git commit
# (opens editor — first line title, blank line, then body)
```

---

## 6. Verify the last commit before push

```bash
git show --stat HEAD
git log -1 --oneline
```

Confirm file list matches intent.

---

## 7. Push to remote

```bash
git remote -v                          # sanity: correct origin URL
git push origin main                     # replace main with your branch
# first time branch:
git push -u origin your-branch-name
```

If rejected (remote advanced):

```bash
git pull --rebase origin main
# resolve conflicts, then push again
git push origin main
```

---

## 8. Deploy on the server (after push)

SSH to the server, then roughly:

```bash
cd /var/www/your-app   # or wherever the clone lives
git fetch origin && git checkout main && git pull origin main
npm ci                  # reproducible installs
npm run build
pm2 restart nexus       # or your process name — uses start:with-recovery if configured per ecosystem.config.js
```

Smoke on server:

```bash
cd /var/www/your-app
npm run operational:smoke
```

Manual check: logged-in Expert → `GET /api/expert/operational/status` on your domain.

---

## Troubleshooting

| Problem | Action |
|---------|--------|
| Committed secrets | Rotate keys; use `git filter-repo` or BFG (support); never rely on `git revert` alone for leaked live keys. |
| Wrong files in commit | `git reset --soft HEAD~1` → re-stage → recommit. |
| Need to amend message only | `git commit --amend -m "new message"` (don’t amend after push unless you coordinate `force-with-lease`). |

---

## One-liner sequence (happy path)

```bash
git status && git diff --stat && git add -A && git commit -m "your message" && git push origin main
```
