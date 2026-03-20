# Sentinel Architecture

**Blueprint version:** v4 (March 19, 2026)
**Architecture pattern:** Bounded monolith — same repo, same database, hard internal module boundaries

## Module Map

| Module | Owns | Rule |
|--------|------|------|
| core/ | Leads, stages, tasks, offers, dispo, projections | Fast operator truth. Never imports from other modules. |
| dialer/ | Call sessions, notes, transcripts, seller memory | Volatile state. Publishes curated outputs to core/. |
| intel/ | Artifacts, facts, dossiers, contradictions | Understands first. Publishes lean outputs via sync snapshots. |
| agents/ | AI agent definitions, prompts, tool access | Proposes. Never writes directly to CRM tables. |
| providers/ | External API adapters | Converts provider shapes to canonical types. Nothing else. |
| mcp-server/ | Sentinel MCP tools | Single AI integration surface. Build once. |
| control-plane/ | Run IDs, review queue, feature flags, events | Nothing writes without traceability. |
| workflows/ | Durable background jobs | Orchestrates. Doesn't own truth. |
| n8n-contracts/ | Webhook schemas for n8n | Documents delivery contracts. n8n delivers, doesn't decide. |

## Boundary Enforcement

Any import that crosses a module boundary without going through a defined contract is a code review rejection. See each module's README.md for specific rules.

## Write Paths

Three write paths exist. All others are violations:

1. **Provider → Intel → Core:** Provider payload → raw record → facts → dossier → review → sync snapshot → projection
2. **Dialer → Core:** Live call data → dialer tables → operator review → publish to client file
3. **Agent → Core:** Agent reads via MCP → writes proposal to review queue → operator approves → standard write path

## Migration Strategy

- New code: always in the correct module folder.
- Existing code: stays where it is until touched for feature work.
- When modifying an existing file: move it to the correct module, rewire imports.
- Within 60-90 days, most active code naturally migrates.

## External Tools (confirmed, with pricing)

| Tool | Cost | Phase | Module |
|------|------|-------|--------|
| Synthflow/Upfirst | $25-29/mo | 0 | providers/voice/ |
| n8n (self-hosted) | $5-10/mo | 0 | n8n-contracts/ |
| Langfuse Cloud | $29/mo | 3 | control-plane/ |
| Composio | $0-29/mo | 3 | agents/ (MCP access) |
| Bricked AI | $49/mo | 6 | providers/bricked/ |
| Firecrawl | $83/mo | 4 | providers/firecrawl/ |
| Regrid | $375+/mo | 4-5 | providers/regrid/ |
| Vapi | $0.05/min | 6 | providers/voice/ |
