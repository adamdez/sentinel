# agents/ — Domain-Specific AI Agent Fleet

**Owns:** Agent definitions, system prompts, MCP tool access lists, review gate policies, agent-specific logic.

**Does not own:** Direct CRM writes, direct database access, provider API calls.

**Primary rule:** Agents propose; operators approve.

## Boundary Rules

- Agents read from Sentinel through MCP tools (src/mcp-server/).
- Agents read from external services through their respective MCP servers (Twilio, Playwright, Composio, etc.).
- Agents write proposals to the review queue in `control-plane/`.
- Agents NEVER write directly to `core/`, `dialer/`, or `intel/` tables.
- Every agent run gets a run ID logged in `control-plane/`.

## Agent Write-Path

```
Agent reads via MCP tools → agent produces proposal (draft summary, draft facts, alert, etc.) → proposal written to control-plane/ review queue → operator reviews (approve / edit / reject) → approved proposals promoted to core/ or intel/ through standard write path
```

Exception: Informational agents (Exception Agent, Ads Monitor) that only surface alerts without proposing CRM changes can write directly to the event log and deliver via n8n. They still get run IDs.

## Each agent folder must contain

1. **AGENT.md** — Role description, trigger conditions, output format, review gate policy
2. **prompt.ts** — System prompt exported as a constant
3. **tools.ts** — List of MCP tools this agent is allowed to access
4. **index.ts** — Agent entry point (Claude Agent SDK invocation)
5. **types.ts** — Input/output types for this agent's proposals

## Current agents

- `exception/` — Nightly scan + SLA monitors. Informational only. No CRM writes.
- `research/` — Lead enrichment, dossier drafting. Review-gated before CRM sync.
- `follow-up/` — Personalized follow-up drafts. Operator approval before send.
- `qa/` — Post-call quality analysis. Informational flags only.
- `dispo/` — Buyer-fit ranking, outreach drafts. Operator selects and approves.
- `ads-monitor/` — Ad performance alerts, waste detection. Informational only.

## Runtime

All agents use the Claude Agent SDK. MCP tools are accessed via the Sentinel MCP server and external MCP servers (Composio for Gmail/Calendar/Slack, Playwright for browser automation, etc.). Traces go to Langfuse Cloud.
