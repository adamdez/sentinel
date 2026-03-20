/**
 * MCP Tool: query_voice_sessions
 *
 * Search and filter AI-handled voice sessions.
 * Part of PR-9 (Voice Front Office).
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { query } from "../db.js";

export function registerQueryVoiceSessions(server: McpServer) {
  server.tool(
    "query_voice_sessions",
    "Search AI-handled voice sessions (Vapi calls). Filter by lead, status, caller type, date range.",
    {
      lead_id: z.string().uuid().optional().describe("Filter by lead UUID"),
      status: z
        .enum(["ringing", "ai_handling", "transferred", "completed", "failed", "voicemail"])
        .optional()
        .describe("Filter by session status"),
      caller_type: z
        .enum(["seller", "buyer", "vendor", "spam", "unknown"])
        .optional()
        .describe("Filter by caller classification"),
      days: z.number().default(30).describe("Look back N days (default 30)"),
      limit: z.number().default(20).describe("Max rows (default 20)"),
    },
    async ({ lead_id, status, caller_type, days, limit }) => {
      const conditions: string[] = [
        `vs.created_at >= now() - interval '${days} days'`,
      ];
      const params: unknown[] = [];
      let paramIdx = 1;

      if (lead_id) {
        conditions.push(`vs.lead_id = $${paramIdx++}`);
        params.push(lead_id);
      }
      if (status) {
        conditions.push(`vs.status = $${paramIdx++}`);
        params.push(status);
      }
      if (caller_type) {
        conditions.push(`vs.caller_type = $${paramIdx++}`);
        params.push(caller_type);
      }

      const where = conditions.join(" AND ");

      const sql = `
        SELECT
          vs.id,
          vs.direction,
          vs.from_number,
          vs.status,
          vs.caller_type,
          vs.caller_intent,
          vs.summary,
          vs.callback_requested,
          vs.duration_seconds,
          vs.cost_cents,
          vs.transferred_to,
          vs.transfer_reason,
          vs.created_at,
          vs.ended_at,
          l.first_name || ' ' || l.last_name AS lead_name,
          l.status AS lead_status,
          p.address AS property_address
        FROM voice_sessions vs
        LEFT JOIN leads l ON l.id = vs.lead_id
        LEFT JOIN properties p ON p.id = l.property_id
        WHERE ${where}
        ORDER BY vs.created_at DESC
        LIMIT ${limit}
      `;

      const rows = await query(sql, params);

      // Summary stats
      const statsSQL = `
        SELECT
          count(*) AS total,
          count(*) FILTER (WHERE caller_type = 'seller') AS sellers,
          count(*) FILTER (WHERE callback_requested) AS callbacks,
          count(*) FILTER (WHERE status = 'transferred') AS transfers,
          round(avg(duration_seconds)::numeric, 0) AS avg_duration_sec,
          round(sum(cost_cents)::numeric / 100, 2) AS total_cost_usd
        FROM voice_sessions
        WHERE created_at >= now() - interval '${days} days'
      `;
      const statsRows = await query(statsSQL);
      const stats = statsRows[0] ?? {};

      const text = [
        `## Voice Sessions (last ${days} days)`,
        `Total: ${stats.total} | Sellers: ${stats.sellers} | Callbacks: ${stats.callbacks} | Transfers: ${stats.transfers}`,
        `Avg duration: ${stats.avg_duration_sec ?? 0}s | Total cost: $${stats.total_cost_usd ?? "0.00"}`,
        "",
        ...rows.map(
          (r: Record<string, unknown>) =>
            `- [${r.status}] ${r.caller_type ?? "unknown"} from ${r.from_number ?? "?"} ` +
            `(${r.duration_seconds ?? 0}s) ${r.lead_name ? `→ ${r.lead_name}` : ""} ` +
            `${r.summary ? `— ${(r.summary as string).slice(0, 80)}` : ""} ` +
            `[${r.created_at}]`,
        ),
      ].join("\n");

      return { content: [{ type: "text" as const, text }] };
    },
  );
}
