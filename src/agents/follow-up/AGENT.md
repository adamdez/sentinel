# Follow-Up Agent

**Domain:** Action core
**Trigger:** Stale lead detected, or operator-scheduled follow-up
**Output:** Personalized follow-up draft using seller memory
**Review gate:** Operator approval required before any send
**Utilization tier:** Tier 3 (compounding, needs seller memory history to produce good drafts)

## MCP tools used

- Sentinel MCP: lead context, seller memory, prior call summaries
- Composio MCP: Gmail (draft email), Twilio MCP (draft SMS)
