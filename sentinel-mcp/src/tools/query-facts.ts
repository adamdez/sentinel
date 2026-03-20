/**
 * query_facts — Search fact assertions extracted from artifacts.
 *
 * Read-only. Used by agents to check what's known about a lead
 * and by Claude Code for intelligence pipeline health checks.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { query } from "../db.js";

export function registerQueryFacts(server: McpServer): void {
  server.tool(
    "query_facts",
    "Search fact assertions. Filter by lead, review status, fact type, or confidence. " +
    "Shows fact value, type, confidence, review status, and source artifact metadata.",
    {
      lead_id: z.string().uuid().optional().describe("Filter by lead UUID"),
      review_status: z.string().optional().describe("Filter by review status: pending, accepted, rejected"),
      fact_type: z.string().optional().describe("Filter by fact type: ownership, deceased, heir, probate_status, financial, property_condition, timeline, contact_info, other"),
      confidence: z.string().optional().describe("Filter by confidence: unverified, low, medium, high"),
      limit: z.number().int().min(1).max(100).optional().describe("Max results (default 20)"),
    },
    async (args) => {
      try {
        const conditions: string[] = [];
        const params: unknown[] = [];
        let paramIdx = 1;

        if (args.lead_id) {
          conditions.push(`f.lead_id = $${paramIdx++}`);
          params.push(args.lead_id);
        }
        if (args.review_status) {
          conditions.push(`f.review_status = $${paramIdx++}`);
          params.push(args.review_status);
        }
        if (args.fact_type) {
          conditions.push(`f.fact_type = $${paramIdx++}`);
          params.push(args.fact_type);
        }
        if (args.confidence) {
          conditions.push(`f.confidence = $${paramIdx++}`);
          params.push(args.confidence);
        }

        const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
        const lim = args.limit ?? 20;

        const rows = await query<Record<string, unknown>>(`
          SELECT f.id, f.lead_id, f.artifact_id, f.run_id,
                 f.fact_type, f.fact_value, f.confidence,
                 f.review_status, f.promoted_field,
                 f.reviewed_by, f.reviewed_at,
                 f.created_at,
                 a.source_url, a.source_type, a.source_label
          FROM fact_assertions f
          LEFT JOIN dossier_artifacts a ON a.id = f.artifact_id
          ${where}
          ORDER BY f.created_at DESC
          LIMIT ${lim}
        `, params);

        return {
          content: [{ type: "text", text: JSON.stringify(rows, null, 2) }],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text", text: `Error querying facts: ${msg}` }],
          isError: true,
        };
      }
    },
  );
}
