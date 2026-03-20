/**
 * query_agent_runs — List recent agent runs from the control plane.
 *
 * Read-only. Used by Claude Code and agents to check run history,
 * verify traceability, and debug agent behavior.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { query } from "../db.js";

export function registerQueryAgentRuns(server: McpServer): void {
  server.tool(
    "query_agent_runs",
    "List recent agent runs. Filter by agent_name, status, or lead_id. " +
    "Returns run ID, agent name, status, duration, token usage, and timing.",
    {
      agent_name: z.string().optional().describe("Filter by agent name (e.g. 'exception', 'research')"),
      status: z.string().optional().describe("Filter by status: running, completed, failed, cancelled"),
      lead_id: z.string().uuid().optional().describe("Filter by lead UUID"),
      limit: z.number().int().min(1).max(100).optional().describe("Max results (default 20)"),
    },
    async (args) => {
      try {
        const conditions: string[] = [];
        const params: unknown[] = [];
        let paramIdx = 1;

        if (args.agent_name) {
          conditions.push(`agent_name = $${paramIdx++}`);
          params.push(args.agent_name);
        }
        if (args.status) {
          conditions.push(`status = $${paramIdx++}`);
          params.push(args.status);
        }
        if (args.lead_id) {
          conditions.push(`lead_id = $${paramIdx++}`);
          params.push(args.lead_id);
        }

        const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
        const lim = args.limit ?? 20;

        const rows = await query<Record<string, unknown>>(`
          SELECT id, agent_name, trigger_type, trigger_ref, status,
                 lead_id, model, prompt_version,
                 input_tokens, output_tokens, cost_cents, duration_ms,
                 started_at, completed_at, error
          FROM agent_runs
          ${where}
          ORDER BY started_at DESC
          LIMIT ${lim}
        `, params);

        return {
          content: [{ type: "text", text: JSON.stringify(rows, null, 2) }],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text", text: `Error querying agent runs: ${msg}` }],
          isError: true,
        };
      }
    },
  );
}
