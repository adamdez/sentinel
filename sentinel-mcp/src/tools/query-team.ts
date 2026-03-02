/**
 * query_team — Team performance metrics.
 * Per-agent: dials, connects, connect rate, leads assigned, conversion rate.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { query } from "../db.js";
import { formatTable } from "../format.js";

const CONNECT_DISPOS = "'interested','appointment','contract','nurture','dead','skip_trace','ghost'";

function periodToSql(period: string): string {
  switch (period) {
    case "today": return "CURRENT_DATE";
    case "week": return "date_trunc('week', CURRENT_DATE)";
    case "month": return "date_trunc('month', CURRENT_DATE)";
    default: return "CURRENT_DATE";
  }
}

export function registerQueryTeam(server: McpServer): void {
  server.tool(
    "query_team",
    "Team performance metrics. Shows per-agent: dials, connects, connect rate, " +
    "avg call duration, leads assigned, conversion rate.",
    {
      period: z.enum(["today", "week", "month"]).optional().describe("Time period (default: week)"),
    },
    async (args) => {
      try {
        const period = args.period ?? "week";
        const since = periodToSql(period);

        // Call performance by agent
        const callSql = `
          SELECT
            up.full_name AS agent,
            COUNT(cl.id)::int AS dials,
            COUNT(cl.id) FILTER (WHERE cl.disposition IN (${CONNECT_DISPOS}))::int AS connects,
            COUNT(cl.id) FILTER (WHERE cl.disposition = 'voicemail')::int AS voicemails,
            COUNT(cl.id) FILTER (WHERE cl.disposition = 'appointment')::int AS appointments,
            ROUND(AVG(cl.duration_sec))::int AS avg_duration,
            ROUND(
              100.0 * COUNT(cl.id) FILTER (WHERE cl.disposition IN (${CONNECT_DISPOS}))
              / NULLIF(COUNT(cl.id), 0), 1
            )::numeric AS connect_rate
          FROM user_profiles up
            LEFT JOIN calls_log cl ON cl.user_id = up.id AND cl.started_at >= ${since}
          WHERE up.is_active = true
          GROUP BY up.id, up.full_name
          ORDER BY dials DESC
        `;

        const callRows = await query(callSql);

        // Lead assignments by agent
        const leadSql = `
          SELECT
            up.full_name AS agent,
            COUNT(l.id)::int AS total_leads,
            COUNT(l.id) FILTER (WHERE l.status = 'lead')::int AS active_leads,
            COUNT(l.id) FILTER (WHERE l.status = 'negotiation')::int AS negotiation,
            COUNT(l.id) FILTER (WHERE l.status = 'closed')::int AS closed,
            COUNT(l.id) FILTER (WHERE l.status = 'prospect')::int AS prospects,
            ROUND(
              100.0 * COUNT(l.id) FILTER (WHERE l.status IN ('negotiation','disposition','closed'))
              / NULLIF(COUNT(l.id) FILTER (WHERE l.status NOT IN ('prospect')), 0), 1
            )::numeric AS conversion_rate
          FROM user_profiles up
            LEFT JOIN leads l ON l.assigned_to::text = up.id::text
          WHERE up.is_active = true
          GROUP BY up.id, up.full_name
          ORDER BY total_leads DESC
        `;

        const leadRows = await query(leadSql);

        // Format call stats
        const callFormatted = (callRows as Record<string, unknown>[]).map((r) => ({
          Agent: r.agent,
          Dials: r.dials,
          Connects: r.connects,
          "Connect %": `${r.connect_rate ?? 0}%`,
          VMs: r.voicemails,
          Appts: r.appointments,
          "Avg Dur": `${r.avg_duration ?? 0}s`,
        }));

        // Format lead stats
        const leadFormatted = (leadRows as Record<string, unknown>[]).map((r) => ({
          Agent: r.agent,
          "Total Leads": r.total_leads,
          Active: r.active_leads,
          Negotiation: r.negotiation,
          Closed: r.closed,
          "Conv %": `${r.conversion_rate ?? 0}%`,
        }));

        const text = `## Team Call Performance (${period})\n` +
          formatTable(callFormatted) +
          `\n\n## Team Lead Assignments\n` +
          formatTable(leadFormatted);

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
