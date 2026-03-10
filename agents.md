# AGENTS.md

## Purpose
Compatibility instructions for tools that expect an `AGENTS.md` file.

## Source of truth
1. `/claude.md` - primary repo operating guide.
2. `/workflow-rules.md` - canonical workflow semantics and guarded mutation authority.
3. `/lead-detail-spec.md` - Lead Detail v1 behavior and UI intent.
4. This file - only extra safeguards not repeated elsewhere.

If there is a conflict, `/claude.md` wins.

## Preserve unless explicitly requested
- auth/session/profile bootstrap
- app shell/layout
- Twilio voice and SMS routes/helpers
- call/SMS logging
- audit/compliance logging
- core leads and pipeline foundations

## Cleanup posture
- Prefer archive over delete on first pass
- Keep changes small and reversible
- Report dependency risk before destructive edits
- Keep route names/shared imports stable where practical
- Document moved/renamed files clearly

## Scope guardrails
- Avoid speculative ERP features
- Avoid duplicate dashboards/surfaces
- Avoid broad new AI surfaces not tied to operator outcomes
- Avoid new infrastructure before cleanup is complete

## Notes on `.claude/skills/`
Skills in `.claude/skills/` are optional helpers. Treat `/claude.md` and active product semantics as authoritative when skill text is stale.
