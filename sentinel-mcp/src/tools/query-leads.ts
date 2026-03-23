/**
 * query_leads — Search and filter leads with property + score joins.
 * The most-used tool. Answers "which leads are overdue?",
 * "show me high-priority prospects", "what leads does Logan have?"
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { query } from "../db.js";
import { maskRows } from "../masking.js";
import { formatTable } from "../format.js";

export function registerQueryLeads(server: McpServer): void {
  server.tool(
    "query_leads",
    "Search and filter leads. Joins with properties, latest scores, and predictions. " +
    "Supports filtering by status, assigned agent, minimum score, overdue flag, source, and tags.",
    {
      status: z.array(z.string()).optional().describe("Filter by status(es): prospect, lead, negotiation, disposition, nurture, dead, closed"),
      assigned_to: z.string().optional().describe("Agent name to filter by (fuzzy match on full_name)"),
      min_score: z.number().optional().describe("Minimum composite score (0-100)"),
      overdue: z.boolean().optional().describe("Only leads past their follow-up date"),
      source: z.string().optional().describe("Filter by lead source"),
      tags: z.array(z.string()).optional().describe("Filter by any matching tag"),
      limit: z.number().min(1).max(100).optional().describe("Max rows (default 25)"),
      order_by: z.enum(["score", "follow_up", "created", "last_contact"]).optional().describe("Sort field (default: score)"),
    },
    async (args) => {
      try {
        const conditions: string[] = [];
        const params: unknown[] = [];
        let paramIdx = 1;

        if (args.status && args.status.length > 0) {
          conditions.push(`l.status = ANY($${paramIdx++})`);
          params.push(args.status);
        }

        if (args.assigned_to) {
          conditions.push(`up.full_name ILIKE $${paramIdx++}`);
          params.push(`%${args.assigned_to}%`);
        }

        if (args.min_score != null) {
          conditions.push(`sr.composite_score >= $${paramIdx++}`);
          params.push(args.min_score);
        }

        if (args.overdue) {
          conditions.push(`l.next_follow_up_at < NOW()`);
          conditions.push(`l.status NOT IN ('dead', 'closed')`);
        }

        if (args.source) {
          conditions.push(`l.source ILIKE $${paramIdx++}`);
          params.push(`%${args.source}%`);
        }

        if (args.tags && args.tags.length > 0) {
          conditions.push(`l.tags && $${paramIdx++}`);
          params.push(args.tags);
        }

        const whereClause = conditions.length > 0
          ? "WHERE " + conditions.join(" AND ")
          : "";

        const orderMap: Record<string, string> = {
          score: "sr.composite_score DESC NULLS LAST",
          follow_up: "l.next_follow_up_at ASC NULLS LAST",
          created: "l.created_at DESC",
          last_contact: "l.last_contact_at DESC NULLS LAST",
        };
        const orderBy = orderMap[args.order_by ?? "score"] ?? orderMap.score;

        const limit = Math.min(args.limit ?? 25, 100);
        params.push(limit);

        const sql = `
          SELECT
            l.status,
            p.address,
            p.city,
            p.state,
            p.owner_name,
            p.owner_phone,
            p.estimated_value,
            p.equity_percent,
            p.property_type,
            p.bedrooms,
            p.bathrooms,
            p.sqft,
            sr.composite_score AS score,
            sr.ai_boost,
            sp.predictive_score,
            sp.days_until_distress,
            up.full_name AS assigned_to,
            l.source,
            l.tags,
            l.total_calls,
            l.live_answers,
            l.call_sequence_step,
            l.last_contact_at,
            l.next_follow_up_at,
            l.next_call_scheduled_at,
            l.notes,
            l.created_at
          FROM leads l
            JOIN properties p ON l.property_id = p.id
            LEFT JOIN user_profiles up ON l.assigned_to::text = up.id::text
            LEFT JOIN LATERAL (
              SELECT composite_score, ai_boost FROM scoring_records
              WHERE property_id = l.property_id
              ORDER BY created_at DESC LIMIT 1
            ) sr ON true
            LEFT JOIN LATERAL (
              SELECT predictive_score, days_until_distress FROM scoring_predictions
              WHERE property_id = l.property_id
              ORDER BY created_at DESC LIMIT 1
            ) sp ON true
          ${whereClause}
          ORDER BY ${orderBy}
          LIMIT $${paramIdx}
        `;

        const rows = await query(sql, params);
        const masked = maskRows(rows as Record<string, unknown>[]);
        const text = formatTable(masked);

        const summary = `**Found ${rows.length} lead(s)**` +
          (args.status ? ` | Status: ${args.status.join(", ")}` : "") +
          (args.assigned_to ? ` | Agent: ${args.assigned_to}` : "") +
          (args.min_score ? ` | Min Score: ${args.min_score}` : "") +
          (args.overdue ? ` | Overdue only` : "");

        return {
          content: [{ type: "text", text: `${summary}\n\n${text}` }],
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
