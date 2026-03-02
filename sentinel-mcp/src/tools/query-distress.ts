/**
 * query_distress — Search distress events.
 * Supports: type filter, severity, period, stacked-only (2+ signals).
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { query } from "../db.js";
import { formatTable } from "../format.js";

function periodToSql(period: string): string {
  switch (period) {
    case "week": return "date_trunc('week', CURRENT_DATE)";
    case "month": return "date_trunc('month', CURRENT_DATE)";
    case "quarter": return "CURRENT_DATE - INTERVAL '90 days'";
    case "all": return "'1970-01-01'::date";
    default: return "date_trunc('month', CURRENT_DATE)";
  }
}

export function registerQueryDistress(server: McpServer): void {
  server.tool(
    "query_distress",
    "Search distress events. Filter by type, severity, period, or only stacked properties (2+ signals). " +
    "Includes summary counts by type.",
    {
      event_type: z.array(z.string()).optional().describe("Filter by distress type(s): probate, pre_foreclosure, tax_lien, code_violation, vacant, divorce, bankruptcy, fsbo, absentee, inherited"),
      min_severity: z.number().optional().describe("Minimum severity (1-10)"),
      period: z.enum(["week", "month", "quarter", "all"]).optional().describe("Time period (default: month)"),
      stacked_only: z.boolean().optional().describe("Only properties with 2+ distress signals"),
      limit: z.number().min(1).max(100).optional().describe("Max rows (default 50)"),
    },
    async (args) => {
      try {
        const period = args.period ?? "month";
        const since = periodToSql(period);
        const limit = Math.min(args.limit ?? 50, 100);

        // Summary by type
        const summarySql = `
          SELECT event_type, COUNT(*)::int AS count, ROUND(AVG(severity), 1)::numeric AS avg_severity
          FROM distress_events WHERE created_at >= ${since}
          GROUP BY event_type ORDER BY count DESC
        `;
        const summaryRows = await query(summarySql);

        let text = `## Distress Signal Summary (${period})\n`;
        if (summaryRows.length > 0) {
          const sumFormatted = (summaryRows as Record<string, unknown>[]).map((r) => ({
            Type: r.event_type,
            Count: r.count,
            "Avg Severity": r.avg_severity,
          }));
          text += formatTable(sumFormatted);
        } else {
          text += "_No distress events in this period._";
        }

        // Detail query
        const conditions: string[] = [`de.created_at >= ${since}`];
        const params: unknown[] = [];
        let paramIdx = 1;

        if (args.event_type && args.event_type.length > 0) {
          conditions.push(`de.event_type = ANY($${paramIdx++})`);
          params.push(args.event_type);
        }

        if (args.min_severity != null) {
          conditions.push(`de.severity >= $${paramIdx++}`);
          params.push(args.min_severity);
        }

        params.push(limit);

        let detailSql: string;

        if (args.stacked_only) {
          detailSql = `
            WITH stacked AS (
              SELECT property_id, COUNT(*)::int AS signal_count
              FROM distress_events WHERE created_at >= ${since}
              GROUP BY property_id HAVING COUNT(*) >= 2
            )
            SELECT
              de.event_type, de.severity, de.confidence, de.source,
              de.created_at,
              p.address, p.city, p.state, p.owner_name, p.estimated_value,
              l.status AS lead_status,
              up.full_name AS assigned_to,
              s.signal_count
            FROM distress_events de
              JOIN stacked s ON s.property_id = de.property_id
              JOIN properties p ON de.property_id = p.id
              LEFT JOIN leads l ON l.property_id = p.id
              LEFT JOIN user_profiles up ON l.assigned_to::text = up.id::text
            WHERE ${conditions.join(" AND ")}
            ORDER BY s.signal_count DESC, de.severity DESC
            LIMIT $${paramIdx}
          `;
        } else {
          detailSql = `
            SELECT
              de.event_type, de.severity, de.confidence, de.source,
              de.created_at,
              p.address, p.city, p.state, p.owner_name, p.estimated_value,
              l.status AS lead_status,
              up.full_name AS assigned_to
            FROM distress_events de
              JOIN properties p ON de.property_id = p.id
              LEFT JOIN leads l ON l.property_id = p.id
              LEFT JOIN user_profiles up ON l.assigned_to::text = up.id::text
            WHERE ${conditions.join(" AND ")}
            ORDER BY de.created_at DESC
            LIMIT $${paramIdx}
          `;
        }

        const detailRows = await query(detailSql, params);

        if (detailRows.length > 0) {
          const formatted = (detailRows as Record<string, unknown>[]).map((r) => ({
            Type: r.event_type,
            Sev: r.severity,
            Address: r.address,
            City: r.city,
            Owner: r.owner_name,
            "Lead Status": r.lead_status ?? "—",
            Assigned: r.assigned_to ?? "—",
            Date: r.created_at ? String(r.created_at).slice(0, 10) : "—",
            ...(args.stacked_only ? { "Signals": (r as Record<string, unknown>).signal_count } : {}),
          }));
          text += `\n\n## Distress Events (${detailRows.length})\n` + formatTable(formatted);
        }

        return { content: [{ type: "text", text }] };
      } catch (err) {
        return {
          content: [{ type: "text", text: `**Error:** ${err instanceof Error ? err.message : String(err)}` }],
          isError: true,
        };
      }
    },
  );
}
