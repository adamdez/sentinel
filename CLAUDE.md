# Sentinel Repo Instructions

This file is local to `C:\Users\adamd\Desktop\Sentinel`.

Instruction Surface Version: `2026-04-06-control-hardening-3`

Fresh-session rule:

- If `CLAUDE.md`, `AGENTS.md`, or `AI-COORDINATION.md` changes, start a fresh session before trusting the active instructions.
- Already-loaded instructions can stay stale for the life of a session.

It is not an AL-global doctrine source.

It must not redefine:

- what AL is
- the AL org hierarchy
- global authority rules
- cross-business doctrine
- the canonical memory structure

Canonical AL doctrine lives in:

- `C:\Users\adamd\Desktop\al-boreland-vault\CLAUDE.md`
- `C:\Users\adamd\Desktop\al-boreland-vault\01-Decisions\`
- `C:\Users\adamd\Desktop\al-boreland-vault\02-Doctrine\`
- `C:\Users\adamd\Desktop\al-boreland-vault\03-Businesses\`

If this repo-level file conflicts with the vault doctrine stack, the vault wins.

Read `AI-COORDINATION.md` for Sentinel-specific file ownership and interface rules.

## Scope Of This Repo

Sentinel is a local implementation repo for CRM, pipeline, dialer, and control-plane work.

This file may define:

- local architecture constraints
- file ownership and workflow rules
- Sentinel-specific write-path rules
- Sentinel-specific review gates

This file may not define AL's identity, board model, or multi-business doctrine.

## Local Rule

Treat Sentinel as a business-system implementation surface.

It plugs into AL.

It does not redefine AL.
