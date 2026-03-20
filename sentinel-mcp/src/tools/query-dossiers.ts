/**
 * query_dossiers — Search and filter dossiers (intelligence briefs).
 *
 * Read-only. Used by agents to check dossier status for a lead
 * and by Claude Code for intelligence pipeline health checks.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { query } from "../db.js";

export function registerQueryDossiers(server: McpServer): void {
  server.tool(
    "query_dossiers",
    "Search dossiers (intelligence briefs). Filter by lead, status, or date range. " +
    "Shows situation summary, decision maker, top facts, review state, and source links.",
    {
      lead_id: z.string().uuid().optional().describe("Filter by lead UUID"),
      status: z.string().optional().describe("Filter by status: proposed, reviewed, flagged, promoted (default: all)"),
      limit: z.number().int().min(1).max(50).optional().describe("Max results (default 10)"),
    },
    async (args) => {
      try {
        const conditions: string[] = [];
        const params: unknown[] = [];
        let paramIdx = 1;

        if (args.lead_id) {
          conditions.push(`d.lead_id = $${paramIdx++}`);
          params.push(args.lead_id);
        }
        if (args.status) {
          conditions.push(`d.status = $${paramIdx++}`);
          params.push(args.status);
        }

        const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
        const lim = args.limit ?? 10;

        const rows = await query<Record<string, unknown>>(`
          SELECT d.id, d.lead_id, d.status,
                 d.situation_summary, d.likely_decision_maker,
                 d.top_facts, d.recommended_call_angle,
                 d.source_links, d.verification_checklist,
                 d.ai_run_id, d.reviewed_by, d.reviewed_at, d.review_notes,
                 d.created_at, d.updated_at,
                 l.status AS lead_status,
                 p.address AS property_address
          FROM dossiers d
          JOIN leads l ON l.id = d.lead_id
          LEFT JOIN properties p ON p.id = d.property_id
          ${where}
          ORDER BY d.created_at DESC
          LIMIT ${lim}
        `, params);

        return {
          content: [{ type: "text", text: JSON.stringify(rows, null, 2) }],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text", text: `Error querying dossiers: ${msg}` }],
          isError: true,
        };
      }
    },
  );
}
