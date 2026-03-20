# Research Agent

**Domain:** Intelligence layer
**Trigger:** Lead promotion to working status, or operator manual request
**Output:** Enriched property facts, dossier draft, contradiction flags
**Review gate:** Review console before CRM sync. Nothing reaches Lead Detail without review or policy auto-accept.
**Utilization tier:** Tier 3 (compounding, value over 2-4 months as research quality improves)

## What it does

- Receives a lead/property to research
- Queries ATTOM adapter for canonical property/owner/mortgage facts
- Queries PropertyRadar adapter for distress signals and owner graph
- Uses Firecrawl (via Composio MCP) for structured extraction on well-structured public sites
- Falls back to Playwright MCP for form-heavy county recorder portals
- Extracts facts, scores confidence, detects contradictions
- Generates a dossier draft with situation summary, likely decision-maker, call angle, risk flags
- Submits dossier + facts as a proposal to the review queue

## MCP tools used

- Sentinel MCP: lead/property context
- Composio MCP: Firecrawl structured extraction
- Playwright MCP: browser automation for county portals
- Supabase MCP: write artifacts/facts to intel tables
