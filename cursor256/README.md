# cursor256 — Nexus project memory

This folder is **your** place to keep important decisions, specs, and summaries from Cursor chats so nothing gets lost when threads scroll away or close. (Name `cursor256` is easy to remember when you ask the agent to read or append here.)

## What actually happens

- **Cursor** stores chats in Cursor’s own product (not in this folder automatically).
- **This repo** does not receive live chat streams from Cursor. Nothing is written here unless **you** or **you + the agent in a session** add content.
- **Best workflow:** after a big discussion, either:
  1. **Paste** an export or notes into `LOG.md` (or a new dated `.md` file), or  
  2. Ask the agent in chat: *“Append a dated summary to `cursor256/LOG.md`”* — the agent can edit that file **during that conversation**.

## Suggested layout

| File | Purpose |
|------|--------|
| `LOG.md` | Running log — newest entries on top (see template inside). |
| `ENTRY-TEMPLATE.md` | Copy for one-off topics if you prefer separate files, e.g. `2026-05-03-container-rules.md`. |

## Security

If a chat ever includes **API keys, passwords, or personal data**, do **not** commit those lines. Redact before saving, or add a private path to `.gitignore` for sensitive notes only.
