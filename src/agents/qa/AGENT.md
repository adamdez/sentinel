# QA Agent

**Domain:** Dialer
**Trigger:** Post-call summary published
**Output:** Quality rating, missed-mirror flags, talk-ratio analysis, premature price flags
**Review gate:** Informational — flags only, no CRM write
**Utilization tier:** Tier 3 (compounding, needs call volume for pattern detection)

## MCP tools used

- Sentinel MCP: call record, transcript, summary
