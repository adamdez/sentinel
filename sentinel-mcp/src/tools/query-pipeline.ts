/**
 * query_pipeline — Pipeline funnel counts and total value by stage.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { query } from "../db.js";
import { formatTable, formatCurrency } from "../format.js";

export function registerQueryPipeline(server: McpServer): void {
  server.tool(
    "query_pipeline",
    "Get pipeline funnel — lead counts and total estimated property value by status. " +
    "Answers: 'what does my pipeline look like?', 'how many leads in negotiation?'",
    {
      assigned_to: z.string().optional().describe("Filter by agent name"),
      include_dead: z.boolean().optional().describe("Include dead leads (default false)"),
    },
    async (args) => {
      try {
        const conditions: string[] = [];
        const params: unknown[] = [];
        let paramIdx = 1;

        if (!args.include_dead) {
          conditions.push(`l.status != 'dead'`);
        }

        if (args.assigned_to) {
          conditions.push(`up.full_name ILIKE $${paramIdx++}`);
          params.push(`%${args.assigned_to}%`);
        }

        const whereClause = conditions.length > 0
          ? "WHERE " + conditions.join(" AND ")
          : "";

        const sql = `
          SELECT
            l.status,
            COUNT(*)::int AS lead_count,
            COALESCE(SUM(p.estimated_value), 0)::bigint AS total_value,
            ROUND(AVG(p.estimated_value))::int AS avg_value,
            ROUND(AVG(sr.composite_score))::int AS avg_score
          FROM leads l
            JOIN properties p ON l.property_id = p.id
            LEFT JOIN user_profiles up ON l.assigned_to::text = up.id::text
            LEFT JOIN LATERAL (
              SELECT composite_score FROM scoring_records
              WHERE property_id = l.property_id
              ORDER BY created_at DESC LIMIT 1
            ) sr ON true
          ${whereClause}
          GROUP BY l.status
          ORDER BY CASE l.status
            WHEN 'prospect' THEN 1
            WHEN 'lead' THEN 2
            WHEN 'negotiation' THEN 3
            WHEN 'disposition' THEN 4
            WHEN 'nurture' THEN 5
            WHEN 'closed' THEN 6
            WHEN 'dead' THEN 7
          END
        `;

        const rows = await query(sql, params);

        // Build formatted output
        const formatted = (rows as Record<string, unknown>[]).map((r) => ({
          Status: r.status,
          Leads: r.lead_count,
          "Total Value": formatCurrency(Number(r.total_value)),
          "Avg Value": formatCurrency(Number(r.avg_value)),
          "Avg Score": r.avg_score ?? "—",
        }));

        const totalLeads = (rows as Record<string, unknown>[]).reduce((s, r) => s + Number(r.lead_count), 0);
        const totalValue = (rows as Record<string, unknown>[]).reduce((s, r) => s + Number(r.total_value), 0);

        const table = formatTable(formatted);
        const summary = `**Pipeline Summary:** ${totalLeads} total leads | ${formatCurrency(totalValue)} total value` +
          (args.assigned_to ? ` | Agent: ${args.assigned_to}` : "");

        return {
          content: [{ type: "text", text: `${summary}\n\n${table}` }],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `**Error:** ${err instanceof Error ? err.message : String(err)}` }],
          isError: true,
        };
      }
    },
  );
}
