/**
 * query_review_queue — List pending review items from the control plane.
 *
 * Read-only. Used by Claude Code to inspect what agents have proposed
 * and what's awaiting operator approval.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { query } from "../db.js";

export function registerQueryReviewQueue(server: McpServer): void {
  server.tool(
    "query_review_queue",
    "List review queue items. Default: pending items sorted by priority. " +
    "Shows agent proposals awaiting operator approval.",
    {
      status: z.string().optional().describe("Filter by status: pending, approved, rejected, expired (default: pending)"),
      agent_name: z.string().optional().describe("Filter by agent name"),
      entity_type: z.string().optional().describe("Filter by entity type: lead, property, task, fact"),
      limit: z.number().int().min(1).max(100).optional().describe("Max results (default 20)"),
    },
    async (args) => {
      try {
        const conditions: string[] = [`rq.status = $1`];
        const params: unknown[] = [args.status ?? "pending"];
        let paramIdx = 2;

        if (args.agent_name) {
          conditions.push(`rq.agent_name = $${paramIdx++}`);
          params.push(args.agent_name);
        }
        if (args.entity_type) {
          conditions.push(`rq.entity_type = $${paramIdx++}`);
          params.push(args.entity_type);
        }

        const where = conditions.join(" AND ");
        const lim = args.limit ?? 20;

        const rows = await query<Record<string, unknown>>(`
          SELECT rq.id, rq.run_id, rq.agent_name, rq.entity_type, rq.entity_id,
                 rq.action, rq.proposal, rq.rationale, rq.status, rq.priority,
                 rq.reviewed_by, rq.reviewed_at, rq.review_notes,
                 rq.created_at, rq.expires_at,
                 ar.model, ar.started_at AS run_started_at
          FROM review_queue rq
          JOIN agent_runs ar ON ar.id = rq.run_id
          WHERE ${where}
          ORDER BY rq.priority DESC, rq.created_at ASC
          LIMIT ${lim}
        `, params);

        return {
          content: [{ type: "text", text: JSON.stringify(rows, null, 2) }],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text", text: `Error querying review queue: ${msg}` }],
          isError: true,
        };
      }
    },
  );
}
