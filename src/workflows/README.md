# workflows/ — Durable Job Definitions

**Owns:** Background job definitions using Trigger.dev v4 (primary) or Mastra (alternative).

**Primary rule:** Orchestrate; don't own business truth.

## What belongs here

- Property promotion enrichment pipelines
- Dossier generation and review-gated CRM sync
- Post-call summary + task generation
- Agent coordination (trigger agents, collect results, route to review)
- Missed-opportunity hunter and stale-lead detection
- Buyer-fit refresh and stale-dispo escalation
- Nightly batch scoring and re-evaluation

## What does NOT belong here

- Core CRM business rules (→ core/)
- UI logic (→ respective module)
- Provider API calls (→ providers/)
- Agent prompts or logic (→ agents/)

## Workflow requirements

Every workflow must:
1. Have a run ID that traces back to the triggering lead/property/call
2. Identify what is synchronous vs async vs review-gated
3. Handle retries and failures gracefully
4. Log completion/failure to control-plane/ event log
