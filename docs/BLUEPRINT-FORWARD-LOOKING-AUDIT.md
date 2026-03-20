# Sentinel Build Blueprint: Forward-Looking Audit

**Date:** 2026-03-18
**Purpose:** Identify every place the blueprint is thinking backward instead of forward, and every capability being left on the table.

---

## Research Sources (6 parallel research sweeps)

1. Voice AI platforms (Vapi, Retell, Synthflow, Bland, Air AI, Upfirst, ElevenLabs, Lindy)
2. Workflow/automation tools (n8n 2026 with MCP + AI agents, Trigger.dev v4, Inngest, Mastra, Zapier AI, Make, Composio, Activepieces)
3. AI coding/building tools (Claude Code, Cursor, Windsurf, v0, Devin, Codex CLI, browser-use, MCP ecosystem)
4. RE investor AI tools (REsimpli AI agents, PropStream Predictive, Bricked AI, InvestorLift, Dono, Leadflow, BatchDialer)
5. MCP ecosystem deep dive (Google Ads MCP, Twilio MCP, Slack MCP, Playwright MCP, Supabase MCP, Postgres MCP)
6. AI-native CRM builders on X/web (Shartsis Claude CRM, Lemkin 20 AI agents, Broca/Polsia, Agentic Business OS pattern, Claude Cowork, subagent templates)

## The Paradigm Shift the Blueprint Misses

The blueprint treats AI as **feature enhancements** to a traditional CRM (AI-assisted post-call notes, AI dossiers, AI scoring). That is 2024 thinking.

The 2026 pattern from bleeding-edge builders is **AI as the operating layer**: a fleet of specialized agents that share context through MCP, coordinate through a workflow engine, and handle entire business functions autonomously, with humans reviewing and deciding at high-stakes moments.

**Evidence:**
- Jason Lemkin (SaaStr): Replaced entire sales team with 20 AI agents managed by 1.2 humans. AI emails were BETTER than human-written. 10x volume. 15% of event revenue.
- Alex Shartsis: Built a Claude + MCP personal CRM in 20 minutes for $20/mo delivering 90%+ of traditional CRM value.
- Ben Broca (Polsia): Solo founder, $3.5M ARR, runs 4,000 autonomous companies with zero employees.
- Jacob Bank (Relay.app): Runs entire marketing org as himself + 40 AI agents doing work of a 5-person team.
- MCP has 97 million monthly SDK downloads. Over 100 specialized Claude Code subagent templates on GitHub.

**What this means for Sentinel:** The end-state architecture should be a Sentinel MCP server + fleet of domain-specific Claude Agent SDK agents, coordinated by a workflow engine, with n8n for delivery/alerting. Not individual AI features bolted onto API routes.

Specific agents for Sentinel:
- Research Agent (Claude Agent SDK + Supabase MCP + Playwright MCP + ATTOM adapter)
- Follow-Up Agent (Claude Agent SDK + Supabase MCP + Twilio MCP)
- Exception/Morning Brief Agent (Claude Agent SDK + Supabase MCP + n8n delivery)
- Dispo Agent (buyer-fit evaluation + outreach drafting)
- QA Agent (call summary quality review)
- Ads Monitor Agent (Google Ads MCP + alert thresholds)

---

## Complete Gap Analysis: 25 Areas Where the Blueprint Needs Revision

### Category A: Backward-Looking Gaps (what exists in codebase but blueprint ignores)

1. **PR sequence doesn't match codebase state** — much already built, risk of duplicating work
2. **Ads Command Center absent** — 17 routes, 15+ tables, most complete feature, not mentioned
3. **Scoring engine unaddressed** — running on cron, needs evaluation for intelligence layer alignment
4. **Gmail integration not mentioned** — exists in production
5. **Feature flags not formalized** — exist in code but not in rollout infrastructure

### Category B: Tool Adoption Gaps (tools exist today that blueprint ignores or defers)

6. **n8n as operational nervous system** — has MCP support (bidirectional), AI agent nodes, human-in-the-loop gates. Deploy Phase 1, not "maybe later."
7. **AI receptionist as Phase 0 quick win** — Synthflow ($29/mo) or Upfirst ($25/mo) can be live in days. Don't wait for Phase 6.
8. **Devin for async parallel dev** — $20/mo, 67% PR merge rate. Write tests, adapters, refactors while you sleep.
9. **v0 by Vercel for UI generation** — 4M users, generates production React + shadcn/ui. Every new surface should start here.
10. **Bricked AI for instant comping** — $49/mo, underwrites in 15 seconds. Integrate before building custom comp engine.
11. **InvestorLift for AI disposition** — 5.5M buyers, AI matching, $3-5K higher assignment fees. Evaluate before building buyer-fit from scratch.
12. **Dono for county record extraction** — $6.5M seed Feb 2026, AI extraction of county records across 700+ jurisdictions.
13. **PropStream/Leadflow propensity scoring** — ML-based seller probability within 90-180 days. Complement, don't duplicate.

### Category C: Architecture Gaps (new paradigms the blueprint doesn't account for)

14. **Claude Agent SDK as agent runtime** — general-purpose, 30+ hour sustained operation, MCP-native. Build domain-specific AI operators, not just custom API routes.
15. **Sentinel MCP server** — expose lead lookup, property context, call outcomes as MCP tools. Foundation for all AI integrations.
16. **MCP mesh architecture** — Google Ads MCP + Twilio MCP (1,700 endpoints) + Slack MCP (GA) + Playwright MCP + Supabase MCP + Sentinel MCP = composable AI agent toolchain.
17. **Multi-agent orchestration** — design control plane for a fleet of specialized agents from the start, not single-workflow jobs.
18. **Browser research agents in Phase 4** — Playwright MCP (Microsoft, production-ready) makes this viable now. Don't wait for Phase 8-9.
19. **Prompt caching 3-layer architecture** — mentioned in passing, needs explicit design in Phase 2 (stable base / semi-stable context / per-call dynamic).
20. **Mastra framework** — TypeScript-first AI agent framework (YC-backed), built for Next.js, agents + workflows + memory + tools. Natural fit for Sentinel's stack.

### Category D: Strategic Gaps (buy-vs-build and competitive positioning)

21. **No buy-vs-build decision framework** — blueprint defaults to "build everything custom." Need explicit evaluation: buy, integrate, or build for each capability.
22. **Workflow engine decision still open** — Trigger.dev v4 (GA, open-source, self-hostable) is the recommendation. But Mastra (TypeScript agents + Inngest integration) may be more natural for AI-heavy orchestration.
23. **Synthetic seller lab deferred to Phase 9** — Vapi agent configured as simulated seller could be a Phase 2-3 training tool.
24. **Scheduled Claude Code tasks not leveraged** — /loop and scheduled tasks can run nightly audits, morning briefs, schema drift checks. Free, already in toolchain.
25. **No competitive positioning against REsimpli** — REsimpli's 8 AI agents (CallAnswer, Speed-to-Lead, CallGrade, MeetGrade, LeadScore, etc.) are exactly what Sentinel aims to build. The blueprint should explicitly position against this: what does Sentinel do that REsimpli can't? (Answer: custom workflow, own data, local market memory, no vendor lock-in, deeper intelligence layer.)

---

## Voice AI Platform Research Summary

| Platform | Best For | Cost | Key Capability |
|----------|----------|------|----------------|
| Synthflow | Quick AI receptionist, no-code | $29-449/mo | Pre-built templates, visual flow builder, <100ms latency |
| Upfirst | Simplest possible answering | $25/mo for 30 calls | Pure receptionist, zero setup |
| Vapi | Full CRM integration, function calling | $0.05/min + LLM costs | Mid-call tool use, Supabase queries during calls |
| Retell | Developer-friendly, compliance | $0.07/min + costs | SOC2/HIPAA, built-in n8n integration |
| Bland AI | High-volume outbound | $299/mo + $0.09/min | Voice cloning, emotional modulation |
| Air AI | Enterprise volume | $25K-100K upfront | FTC lawsuit Aug 2025. Avoid. |
| Lindy | Customizable agents | $50/mo + $0.19/min | 30+ languages, 7-day trial |

**Recommended path:**
- Phase 0: Synthflow Starter or Upfirst ($25-30/mo) — basic inbound answering, live in days
- Phase 2-3: Evaluate Vapi for CRM-connected agent with function calling
- Phase 6: Full voice front office with warm transfer, seller memory injection

---

## Workflow/Automation Research Summary

| Tool | Status 2026 | Key New Capability | Self-Host |
|------|------------|-------------------|-----------|
| n8n | Thriving | MCP bidirectional, AI agent nodes, human-in-the-loop | Yes (free) |
| Trigger.dev | v4 GA | Warm starts 100-300ms, waitpoint tokens, AI agent toolkit | Yes |
| Inngest | $20M Series A | Checkpointing (50% latency reduction), MCP dev server, agent skills | Yes (OSS) |
| Mastra | Early-production | TypeScript agents + workflows + memory + tools, YC-backed | Yes (OSS) |
| Zapier | AI-native | Zapier Agents (autonomous across 7K apps), MCP support | No |

---

## MCP Servers Relevant to Sentinel

| MCP Server | Status | What It Enables |
|-----------|--------|----------------|
| Supabase MCP | Production (already connected) | Database management, migrations, queries, Edge Functions |
| Google Ads MCP | Production (official from Google) | Natural language campaign queries, performance analysis |
| Twilio MCP | Alpha (1,700+ endpoints) | Call management, SMS, phone numbers, recordings |
| Slack MCP | GA (Feb 2026) | Pipeline alerts, daily summaries, lead notifications |
| Playwright MCP | Production (Microsoft) | Browser automation, county record scraping, web research |
| Google Calendar MCP | Community | Callback scheduling, appointment management |
| Gmail MCP | Community (Google Workspace) | Email management through agent sessions |

---

## AI Agent Frameworks Summary

| Framework | Language | Best For | MCP Native |
|-----------|----------|----------|------------|
| Claude Agent SDK | Python + TypeScript | Domain-specific AI operators, long-running agents | Yes (first-class) |
| OpenAI Agents SDK | Python | Quick prototyping, hosted tools | Partial |
| LangGraph | Python (TS partial) | Complex stateful multi-agent systems | Via tools |
| CrewAI | Python | Role-based agent teams, fast prototyping | Via tools |
| Mastra | TypeScript | Next.js teams, agents + workflows + memory | Yes |

---

## RE Investor Tool Landscape Summary

**What the cutting-edge 2-person wholesaling operation looks like in 2026:**
- REsimpli ($299/mo) or custom CRM as operational hub
- PropStream ($199/mo) for AI-scored lead lists with propensity scoring
- Bricked AI ($49/mo) for 15-second underwriting
- InvestorLift (~$667/mo) for AI buyer matching
- Voice AI ($50-150/mo) for 24/7 inbound coverage
- n8n (free self-hosted) for automation glue
- Claude/GPT ($20-200/mo) for analysis, scripts, follow-up

**Sentinel's competitive advantage over off-the-shelf:**
- Own your data (no vendor lock-in)
- Custom workflow matching your exact process
- Local market memory that compounds over time
- Deeper intelligence layer with evidence-backed dossiers
- Integrated dialer workspace (not bolted-on)
- Custom AI agents built for your specific seller conversations

**Where Sentinel should integrate instead of build:**
- Comping/underwriting (Bricked AI API or similar)
- Disposition/buyer matching (InvestorLift or similar)
- County record extraction (Dono when available)
- Propensity scoring (supplement with PropStream/Leadflow data)
