# mcp-server/ — Sentinel MCP Server

**Owns:** The single MCP surface that all AI systems use to interact with Sentinel.

**Primary rule:** Build once, every AI tool talks through it.

## Why this exists

All AI systems — agents, voice AI, Claude Code, n8n AI nodes — interact with Sentinel through this standardized MCP interface. This means:
- Every new AI tool you adopt can immediately talk to your CRM
- You don't build custom integrations for each agent
- Read and write paths are controlled in one place

## Tools to expose (Phase 1-2)

- Lead lookup (by ID, address, phone, name)
- Property context (canonical property card data)
- Call outcome logging (structured call result)
- Task creation (with required next-action enforcement)
- Follow-up scheduling
- Pipeline queries (leads by stage, overdue, stale)
- Seller memory retrieval (last N call summaries, objections, timeline)

## Used by

- All agents in src/agents/
- Voice AI platform (Vapi in Phase 6)
- Claude Code (development and scheduled tasks)
- n8n AI agent nodes
- Any future AI system

## Write rules

- Read operations: unrestricted
- Append operations (log call, create task): allowed with run ID attribution
- Mutation operations (change stage, update lead): go through review queue or require explicit operator invocation
