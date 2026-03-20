#!/usr/bin/env node

/**
 * Sentinel MCP Server — Database Intelligence, Ads Management, Context Snapshot
 *
 * Claude Code superpowers:
 * 1. Query Sentinel's live Supabase DB (leads, pipeline, calls, revenue, distress)
 * 2. Read ad performance + manage Google Ads with confirmation before executing
 * 3. Get full ContextSnapshot for a lead (dialer workspace + agent fleet foundation)
 * 4. Create tasks and update next_action (guarded write tools)
 *
 * Transport: stdio (Claude Code ←→ sentinel-mcp)
 */

import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

// Resources
import { SCHEMA_TEXT } from "./resources/schema.js";
import { registerKpisResource } from "./resources/kpis.js";

// DB Tools
import { registerRunSql } from "./tools/run-sql.js";
import { registerQueryLeads } from "./tools/query-leads.js";
import { registerQueryPipeline } from "./tools/query-pipeline.js";
import { registerQueryCalls } from "./tools/query-calls.js";
import { registerQueryRevenue } from "./tools/query-revenue.js";
import { registerQueryProperty } from "./tools/query-property.js";
import { registerQueryTeam } from "./tools/query-team.js";
import { registerQueryDistress } from "./tools/query-distress.js";

// Ads Tools
import { registerAdsPerformance } from "./tools/ads-performance.js";
import { registerAdsManage } from "./tools/ads-manage.js";

// Context Snapshot + Write Tools (PR-2)
import { registerLeadContext } from "./tools/lead-context.js";
import { registerCreateTask } from "./tools/create-task.js";
import { registerUpdateNextAction } from "./tools/update-next-action.js";

// DB shutdown
import { shutdown } from "./db.js";

async function main() {
  const server = new McpServer({
    name: "sentinel-mcp",
    version: "1.0.0",
  });

  // ─── Static Resources ──────────────────────────────────────────────

  // Full database schema reference — enables Claude to write accurate SQL
  server.resource(
    "schema",
    "sentinel://schema",
    { description: "Full Sentinel database schema (20 tables, columns, types, enums, relationships)", mimeType: "text/plain" },
    async (uri) => ({
      contents: [{ uri: uri.href, text: SCHEMA_TEXT }],
    }),
  );

  // Live KPI snapshot
  registerKpisResource(server);

  // ─── Database Tools (8 tools, all read-only) ──────────────────────

  registerRunSql(server);           // Arbitrary read-only SQL
  registerQueryLeads(server);       // Search/filter leads + scores
  registerQueryPipeline(server);    // Funnel counts by stage
  registerQueryCalls(server);       // Call KPIs + details
  registerQueryRevenue(server);     // Deal revenue aggregations
  registerQueryProperty(server);    // Deep dive single property
  registerQueryTeam(server);        // Per-agent performance
  registerQueryDistress(server);    // Distress signal search

  // ─── Google Ads Tools (2 tools) ───────────────────────────────────

  registerAdsPerformance(server);   // Read ad performance data
  registerAdsManage(server);        // Manage ads with confirmation flow

  // ─── Context Snapshot + Write Tools (3 tools) — PR-2 ─────────────

  registerLeadContext(server);      // Full ContextSnapshot for a lead (read-only)
  registerCreateTask(server);       // Create a task linked to lead/deal (write)
  registerUpdateNextAction(server); // Update next_action + due date (write, lock-safe)

  // ─── Start ────────────────────────────────────────────────────────

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error("[sentinel-mcp] Server started — 13 tools, 2 resources");

  // Graceful shutdown
  const cleanup = async () => {
    console.error("[sentinel-mcp] Shutting down...");
    await shutdown();
    process.exit(0);
  };

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);
}

main().catch((err) => {
  console.error("[sentinel-mcp] Fatal error:", err);
  process.exit(1);
});
