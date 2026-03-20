# providers/firecrawl/ — Structured Web Extraction

**Role:** Schema-based JSON extraction from web pages. Complement to Playwright MCP.
**Pricing:** $83/mo Standard (100K credits). FIRE-1 agent tier costs more and bills on failed requests.
**MCP:** First-class MCP server available (remote hosted). Also available as Composio toolkit.
**Phase:** Evaluate Phase 4

**County recorder reliability: MEDIOCRE.** FIRE-1 can navigate dynamic sites but has known bugs with dynamic dropdowns — exactly the pattern county recorders use. Use /extract as first-pass for well-structured public records sites. Fall back to custom Playwright MCP workers for form-heavy county portals. Do not use as sole county recorder solution.
