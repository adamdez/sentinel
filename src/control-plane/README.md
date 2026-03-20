# control-plane/ — Traceability, Review, and Governance

**Owns:** Run IDs, prompt versions, tool call logs, eval datasets, approvals, rollout flags, event flows, feature flags, review queue.

**Does not own:** Permanent business truth by itself.

**Primary rule:** Nothing durable writes to CRM without traceability.

## What lives here

- **Run registry:** Every agent execution logged with inputs, outputs, duration, cost, run ID
- **Prompt registry:** Versioned system prompts for all agents (prompt_registry table already exists)
- **Review queue:** Proposed CRM writes from agents awaiting operator approval
- **Feature flags:** Persisted in database with per-user overrides and admin UI
- **Event log:** Key business events (lead created, first contact, stage changed, offer made, contract, stale exception)
- **Rollout flags:** Every AI workflow starts in shadow mode or review-required mode
- **Eval datasets:** Gold sets for post-call summaries, objection tags, routing quality, dossier usefulness

## External tools

- **Langfuse Cloud ($29/mo Core):** Trace capture, prompt management, evals, cost tracking. Use from Phase 3 day one. Do not self-host.
- **Composio ($0 free / $29/mo):** 982 toolkits for agent tool access (Gmail, Calendar, Slack, etc.). Native Claude MCP support. Use from Phase 3.

## Review queue behavior

1. Agent produces a proposal (draft summary, draft facts, enrichment results, follow-up draft)
2. Proposal written to review queue with run ID, agent ID, proposed changes, evidence
3. Operator sees proposal in Review Console UI
4. Operator approves (promoted to core/intel via standard write path), edits then approves, or rejects
5. Low-risk proposals can be auto-accepted by policy after quality is measured stable
