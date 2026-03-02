/**
 * query_calls — Call log analytics and KPIs.
 * Answers: "how many dials today?", "what's our connect rate?",
 * "show me Nathan's call stats this week"
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { query } from "../db.js";
import { maskRows } from "../masking.js";
import { formatTable } from "../format.js";

const CONNECT_DISPOS = "'interested','appointment','contract','nurture','dead','skip_trace','ghost'";

function periodToSql(period: string): string {
  switch (period) {
    case "today": return "CURRENT_DATE";
    case "yesterday": return "CURRENT_DATE - INTERVAL '1 day'";
    case "week": return "date_trunc('week', CURRENT_DATE)";
    case "month": return "date_trunc('month', CURRENT_DATE)";
    case "all": return "'1970-01-01'::date";
    default: return "CURRENT_DATE";
  }
}

export function registerQueryCalls(server: McpServer): void {
  server.tool(
    "query_calls",
    "Call log analytics. Returns KPIs (dials, connects, connect rate, avg duration) " +
    "and optionally individual call rows. Supports period and agent filtering.",
    {
      period: z.enum(["today", "yesterday", "week", "month", "all"]).optional().describe("Time period (default: today)"),
      user: z.string().optional().describe("Agent name (fuzzy match)"),
      disposition: z.string().optional().describe("Filter by call disposition"),
      include_details: z.boolean().optional().describe("Include individual call rows (default false)"),
    },
    async (args) => {
      try {
        const period = args.period ?? "today";
        const periodSql = periodToSql(period);

        const conditions: string[] = [`cl.started_at >= ${periodSql}`];
        const params: unknown[] = [];
        let paramIdx = 1;

        if (args.user) {
          conditions.push(`up.full_name ILIKE $${paramIdx++}`);
          params.push(`%${args.user}%`);
        }

        if (args.disposition) {
          conditions.push(`cl.disposition = $${paramIdx++}`);
          params.push(args.disposition);
        }

        const whereClause = "WHERE " + conditions.join(" AND ");

        // KPI summary
        const kpiSql = `
          SELECT
            COUNT(*)::int AS total_dials,
            COUNT(*) FILTER (WHERE cl.disposition IN (${CONNECT_DISPOS}))::int AS connects,
            COUNT(*) FILTER (WHERE cl.disposition = 'voicemail')::int AS voicemails,
            COUNT(*) FILTER (WHERE cl.disposition = 'appointment')::int AS appointments,
            COUNT(*) FILTER (WHERE cl.disposition = 'contract')::int AS contracts,
            COUNT(*) FILTER (WHERE cl.disposition = 'no_answer')::int AS no_answers,
            ROUND(AVG(cl.duration_sec))::int AS avg_duration_sec,
            SUM(cl.duration_sec)::int AS total_duration_sec,
            ROUND(
              100.0 * COUNT(*) FILTER (WHERE cl.disposition IN (${CONNECT_DISPOS}))
              / NULLIF(COUNT(*), 0), 1
            )::numeric AS connect_rate_pct
          FROM calls_log cl
            LEFT JOIN user_profiles up ON cl.user_id = up.id
          ${whereClause}
        `;

        const [kpis] = await query(kpiSql, params);
        const k = kpis as Record<string, unknown>;

        const totalSec = Number(k.total_duration_sec ?? 0);
        const hrs = Math.floor(totalSec / 3600);
        const mins = Math.floor((totalSec % 3600) / 60);

        let text = `## Call KPIs (${period})\n` +
          `**Total Dials:** ${k.total_dials}\n` +
          `**Connects:** ${k.connects} (${k.connect_rate_pct ?? 0}%)\n` +
          `**Voicemails:** ${k.voicemails}\n` +
          `**Appointments:** ${k.appointments}\n` +
          `**Contracts:** ${k.contracts}\n` +
          `**No Answers:** ${k.no_answers}\n` +
          `**Avg Duration:** ${k.avg_duration_sec ?? 0}s\n` +
          `**Total Talk Time:** ${hrs}h ${mins}m`;

        if (args.user) text += `\n**Agent:** ${args.user}`;

        // Optional detail rows
        if (args.include_details) {
          const detailSql = `
            SELECT
              cl.started_at,
              cl.phone_dialed,
              cl.disposition,
              cl.duration_sec,
              cl.notes,
              cl.ai_summary,
              up.full_name AS agent,
              p.address,
              p.owner_name
            FROM calls_log cl
              LEFT JOIN user_profiles up ON cl.user_id = up.id
              LEFT JOIN leads l ON cl.lead_id = l.id
              LEFT JOIN properties p ON COALESCE(cl.property_id, l.property_id) = p.id
            ${whereClause}
            ORDER BY cl.started_at DESC
            LIMIT 50
          `;

          const detailRows = await query(detailSql, params);
          const masked = maskRows(detailRows as Record<string, unknown>[]);
          text += "\n\n## Call Details\n" + formatTable(masked);
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
