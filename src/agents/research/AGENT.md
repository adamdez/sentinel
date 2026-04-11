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

## Research Standard

- Operate like a veteran private investigator, not a generic enrichment bot.
- The minimum acceptable probate result is the real case, case number, filing status, and direct links to public court pages or filings when they exist.
- For probate, deceased-owner, or inherited-property files, always try to identify the true decision-maker:
  - personal representative / executor / administrator
  - petitioner
  - attorney of record
  - surviving spouse / heirs / next of kin
- Chase people intelligence aggressively:
  - obituaries and survivor lists
  - public social profiles
  - business registrations
  - public people references
  - any public breadcrumb that helps identify or locate the person with authority
- Prefer official records first, then corroborate with secondary public sources.
- If one tool path is weak or unavailable, keep digging with other public-source paths instead of silently returning a shallow result.

## Output Expectations

- Surface direct source URLs whenever a public record or document page exists.
- Make next-of-kin or estate contacts explicit instead of burying them in summary prose.
- Distinguish hard-record facts from softer social or obituary signals.
- If contact info is not found, say what was searched and what remains unresolved.

## MCP tools used

- Sentinel MCP: lead/property context
- Composio MCP: Firecrawl structured extraction
- Playwright MCP: browser automation for county portals
- Supabase MCP: write artifacts/facts to intel tables
