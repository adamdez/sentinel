# intel/ — System of Understanding

**Owns:** Artifacts, fact assertions, dossiers, provider normalization, review queue data, buyer-fit assessments, contradiction flags, research jobs, CRM sync snapshots.

**Does not own:** Direct operator workflow state, lead stages, tasks, call sessions, pipeline logic.

**Primary rule:** Understand first; publish lean outputs.

## Boundary Rules

- Writes to its OWN tables only (artifacts, fact_assertions, dossiers, crm_sync_snapshots, etc.).
- Publishes to `core/` ONLY through CRM sync snapshots — never directly into lead tables.
- NEVER imports from `dialer/` or `agents/`.
- Provider data enters through `providers/` adapters, gets stored as raw records/artifacts here.

## Intel Write-Path

```
Provider payload (via providers/ adapter) → raw_record / artifact (intel/ tables) → normalized fact assertions (intel/ tables) → dossier / assessment (intel/ tables) → review policy check (control-plane/) → CRM sync snapshot (intel/ tables) → Sentinel projection fields updated (core/ tables)
```

No provider payload writes directly into lead tables. No model output writes directly without review or policy gate.

## What belongs here

- Import batch tracking and raw record storage
- Artifact storage and evidence linking
- Fact assertion extraction and confidence scoring
- Dossier generation and versioning
- Contradiction detection and resolution records
- Buyer-fit assessment data
- CRM sync snapshot creation and history
- Review queue data (what needs human approval)
- Confidence ladder logic (weak / probable / strong / verified / rejected)

## What does NOT belong here

- Lead CRUD or stage logic (→ core/)
- Call sessions or live notes (→ core/)
- Agent orchestration or prompts (→ agents/)
- Provider API calls (→ providers/)
