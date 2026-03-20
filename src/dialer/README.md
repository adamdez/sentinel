# dialer/ — System of Conversation

**Owns:** Call sessions, live notes, transcript chunks, AI suggestions, extracted facts (before confirmation), seller memory, disposition capture, post-call review flow, context snapshot consumption.

**Does not own:** Permanent lead/property state, CRM workflow rules, durable client file records, pipeline logic.

**Primary rule:** Volatile conversation state. Publish curated outputs only.

## Boundary Rules

- Reads from `core/` ONLY through the context snapshot contract (see `dialer/contracts/`).
- Writes to `core/` ONLY through the publish-to-client-file function.
- NEVER imports directly from `core/` tables or queries `core/` database tables.
- NEVER imports from `intel/` or `agents/`.
- Has its own tables: call_sessions, live_notes, transcript_chunks, extracted_facts_draft, seller_memory, ai_suggestions.

## Dialer Write-Path

```
Live call data → dialer/ tables (volatile) → final summary generated at call end → operator reviews extracted facts + summary → confirmed outputs published to core/ client file
```

Call session data is volatile. Client file data is curated. Only the publish function crosses the boundary.

## What belongs here

- Call session lifecycle (create, active, ended, reviewed)
- Live AI notes (streaming, token-by-token)
- Transcript handling and STT integration
- Seller memory panel (last 3 summaries, objections, callback time, decision-maker)
- Pre-call context card (reads from context snapshot)
- Post-call review and publish flow
- Disposition capture
- AI suggestion panel during calls
- Prompt caching 3-layer architecture (stable base, per-lead, per-call dynamic)

## What does NOT belong here

- Lead stage transitions (→ core/)
- Task creation for follow-up (→ core/ via publish)
- Dossier rendering (→ intel/)
- Agent logic (→ agents/)
- Twilio/voice provider API calls (→ providers/voice/)
