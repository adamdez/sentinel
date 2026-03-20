# Exception Agent

**Domain:** Action core monitoring
**Trigger:** Nightly scan + real-time SLA monitors
**Output:** Morning priority brief, exception alerts
**Review gate:** Informational — no CRM write. Delivers via n8n.
**Utilization tier:** Tier 2 (habit loop, consistent use by day 60) transitioning to Tier 3 (compounding, full value by month 4 as pipeline grows)

## What it monitors

- Lead has no next action after a qualified conversation
- Follow-up is overdue beyond SLA for warm / hot / offer-candidate leads
- Offer-candidate has no fresh comp packet or low-confidence valuation
- Negotiation is active but subject media or decision-maker confidence is weak
- Stale dispo: contract exists but no buyer outreach movement
- Contactability failure: repeated wrong-number / no-answer with no alternate channel attempted
- Contradiction unresolved: major ownership / mortgage / probate conflict on a live lead

## MCP tools used

- Sentinel MCP: lead lookup, pipeline queries, task queries, call history
- Supabase MCP: direct database queries for complex exception logic

## Delivery

Results delivered via n8n to Logan's phone (SMS/push) and the Sentinel exception queue UI.
