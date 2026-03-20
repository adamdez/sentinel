/**
 * query_artifacts — Search dossier artifacts (raw evidence from external sources).
 *
 * Read-only. Used by agents to inspect evidence collected for a lead
 * and by Claude Code for intelligence pipeline audits.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { query } from "../db.js";

export function registerQueryArtifacts(server: McpServer): void {
  server.tool(
    "query_artifacts",
    "Search dossier artifacts (raw evidence). Filter by lead, source type, or run. " +
    "Shows source URL, type, extracted notes, and provenance metadata.",
    {
      lead_id: z.string().uuid().optional().describe("Filter by lead UUID"),
      source_type: z.string().optional().describe("Filter by source type: probate_filing, assessor, court_record, obituary, news, other"),
      run_id: z.string().uuid().optional().describe("Filter by research run UUID"),
      limit: z.number().int().min(1).max(100).optional().describe("Max results (default 20)"),
    },
    async (args) => {
      try {
        const conditions: string[] = [];
        const params: unknown[] = [];
        let paramIdx = 1;

        if (args.lead_id) {
          conditions.push(`a.lead_id = $${paramIdx++}`);
          params.push(args.lead_id);
        }
        if (args.source_type) {
          conditions.push(`a.source_type = $${paramIdx++}`);
          params.push(args.source_type);
        }
        if (args.run_id) {
          conditions.push(`a.run_id = $${paramIdx++}`);
          params.push(args.run_id);
        }

        const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
        const lim = args.limit ?? 20;

        const rows = await query<Record<string, unknown>>(`
          SELECT a.id, a.lead_id, a.dossier_id, a.run_id,
                 a.source_url, a.source_type, a.source_label,
                 a.extracted_notes, a.captured_by,
                 a.created_at
          FROM dossier_artifacts a
          ${where}
          ORDER BY a.created_at DESC
          LIMIT ${lim}
        `, params);

        return {
          content: [{ type: "text", text: JSON.stringify(rows, null, 2) }],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text", text: `Error querying artifacts: ${msg}` }],
          isError: true,
        };
      }
    },
  );
}
