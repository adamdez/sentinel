/**
 * Live KPI snapshot resource.
 * Runs multiple queries to build a real-time overview of Sentinel.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { query } from "../db.js";
import { formatCurrency } from "../format.js";

export function registerKpisResource(server: McpServer): void {
  server.resource(
    "kpis",
    "sentinel://kpis",
    { description: "Live KPI snapshot — pipeline, calls, revenue, distress signals", mimeType: "text/plain" },
    async (uri) => {
      const text = await buildKpiSnapshot();
      return { contents: [{ uri: uri.href, text }] };
    },
  );
}

async function buildKpiSnapshot(): Promise<string> {
  const now = new Date().toISOString();

  // Pipeline by status
  const pipeline = await query<{ status: string; count: string }>(
    `SELECT status, COUNT(*)::text AS count FROM leads GROUP BY status ORDER BY count DESC`,
  );

  // Total pipeline value (excluding dead/closed)
  const [valueRow] = await query<{ pipeline_value: string }>(
    `SELECT COALESCE(SUM(p.estimated_value), 0)::text AS pipeline_value
     FROM leads l JOIN properties p ON l.property_id = p.id
     WHERE l.status NOT IN ('dead', 'closed')`,
  );

  // Today's call stats
  const [callsToday] = await query<{ dials: string; connects: string }>(
    `SELECT
       COUNT(*)::text AS dials,
       COUNT(*) FILTER (WHERE disposition IN ('interested','appointment','contract','nurture','dead','skip_trace','ghost'))::text AS connects
     FROM calls_log WHERE started_at >= CURRENT_DATE`,
  );

  // This week dials
  const [callsWeek] = await query<{ dials: string }>(
    `SELECT COUNT(*)::text AS dials FROM calls_log
     WHERE started_at >= date_trunc('week', CURRENT_DATE)`,
  );

  // Revenue this month
  const [revMonth] = await query<{ revenue: string; deals: string }>(
    `SELECT COALESCE(SUM(assignment_fee), 0)::text AS revenue, COUNT(*)::text AS deals
     FROM deals WHERE status = 'closed' AND closed_at >= date_trunc('month', CURRENT_DATE)`,
  );

  // Revenue YTD
  const [revYtd] = await query<{ revenue: string; deals: string }>(
    `SELECT COALESCE(SUM(assignment_fee), 0)::text AS revenue, COUNT(*)::text AS deals
     FROM deals WHERE status = 'closed' AND closed_at >= date_trunc('year', CURRENT_DATE)`,
  );

  // Overdue follow-ups
  const [overdue] = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM leads
     WHERE next_follow_up_at < NOW() AND status NOT IN ('dead', 'closed')`,
  );

  // New distress signals this week
  const [signals] = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM distress_events
     WHERE created_at >= date_trunc('week', CURRENT_DATE)`,
  );

  const dialsToday = parseInt(callsToday?.dials ?? "0");
  const connectsToday = parseInt(callsToday?.connects ?? "0");
  const connectRate = dialsToday > 0 ? Math.round((connectsToday / dialsToday) * 100) : 0;

  const pipelineStr = pipeline
    .map((r) => `${r.status}: ${r.count}`)
    .join(" | ");

  return `# Sentinel KPI Snapshot (${now.slice(0, 19)} UTC)

## Pipeline
${pipelineStr}
Total Pipeline Value: ${formatCurrency(parseInt(valueRow?.pipeline_value ?? "0"))} (excluding dead/closed)
Overdue Follow-ups: ${overdue?.count ?? 0}

## Calls
Today: ${dialsToday} dials, ${connectsToday} connects, ${connectRate}% connect rate
This Week: ${callsWeek?.dials ?? 0} total dials

## Revenue
This Month: ${formatCurrency(parseInt(revMonth?.revenue ?? "0"))} (${revMonth?.deals ?? 0} deals)
YTD: ${formatCurrency(parseInt(revYtd?.revenue ?? "0"))} (${revYtd?.deals ?? 0} deals)

## Intelligence
New Distress Signals This Week: ${signals?.count ?? 0}
`;
}
