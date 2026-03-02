/**
 * query_revenue — Deal revenue aggregations.
 * Answers: "what's our revenue this month?", "YTD total?",
 * "average assignment fee?", "revenue by agent?"
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { query } from "../db.js";
import { formatTable, formatCurrency } from "../format.js";

export function registerQueryRevenue(server: McpServer): void {
  server.tool(
    "query_revenue",
    "Deal revenue analysis. Shows closed deals with assignment fees, " +
    "monthly/YTD totals, and optional per-agent breakdown.",
    {
      period: z.enum(["month", "quarter", "year", "all"]).optional().describe("Time period (default: year)"),
      by_agent: z.boolean().optional().describe("Break down by agent (default false)"),
    },
    async (args) => {
      try {
        const period = args.period ?? "year";
        const periodMap: Record<string, string> = {
          month: "date_trunc('month', CURRENT_DATE)",
          quarter: "date_trunc('quarter', CURRENT_DATE)",
          year: "date_trunc('year', CURRENT_DATE)",
          all: "'1970-01-01'::date",
        };
        const since = periodMap[period];

        // This month vs last month
        const monthSql = `
          SELECT
            COALESCE(SUM(d.assignment_fee) FILTER (WHERE d.closed_at >= date_trunc('month', CURRENT_DATE)), 0)::bigint AS this_month,
            COUNT(*) FILTER (WHERE d.closed_at >= date_trunc('month', CURRENT_DATE))::int AS this_month_deals,
            COALESCE(SUM(d.assignment_fee) FILTER (
              WHERE d.closed_at >= date_trunc('month', CURRENT_DATE) - INTERVAL '1 month'
                AND d.closed_at < date_trunc('month', CURRENT_DATE)
            ), 0)::bigint AS last_month,
            COUNT(*) FILTER (
              WHERE d.closed_at >= date_trunc('month', CURRENT_DATE) - INTERVAL '1 month'
                AND d.closed_at < date_trunc('month', CURRENT_DATE)
            )::int AS last_month_deals,
            COALESCE(SUM(d.assignment_fee) FILTER (WHERE d.closed_at >= date_trunc('year', CURRENT_DATE)), 0)::bigint AS ytd,
            COUNT(*) FILTER (WHERE d.closed_at >= date_trunc('year', CURRENT_DATE))::int AS ytd_deals,
            ROUND(AVG(d.assignment_fee))::int AS avg_fee
          FROM deals d
          WHERE d.status = 'closed'
        `;

        const [summary] = await query(monthSql);
        const s = summary as Record<string, unknown>;

        const thisMonth = Number(s.this_month ?? 0);
        const lastMonth = Number(s.last_month ?? 0);
        const change = lastMonth > 0 ? Math.round(((thisMonth - lastMonth) / lastMonth) * 100) : null;

        let text = `## Revenue Summary\n` +
          `**This Month:** ${formatCurrency(thisMonth)} (${s.this_month_deals} deals)\n` +
          `**Last Month:** ${formatCurrency(lastMonth)} (${s.last_month_deals} deals)` +
          (change != null ? ` (${change > 0 ? "+" : ""}${change}%)` : "") + "\n" +
          `**YTD:** ${formatCurrency(Number(s.ytd ?? 0))} (${s.ytd_deals} deals)\n` +
          `**Avg Assignment Fee:** ${formatCurrency(Number(s.avg_fee ?? 0))}`;

        // Per-agent breakdown
        if (args.by_agent) {
          const agentSql = `
            SELECT
              COALESCE(up.full_name, 'Unassigned') AS agent,
              COUNT(*)::int AS deals,
              COALESCE(SUM(d.assignment_fee), 0)::bigint AS total_revenue,
              ROUND(AVG(d.assignment_fee))::int AS avg_fee
            FROM deals d
              JOIN leads l ON d.lead_id = l.id
              LEFT JOIN user_profiles up ON l.assigned_to::text = up.id::text
            WHERE d.status = 'closed' AND d.closed_at >= ${since}
            GROUP BY up.full_name
            ORDER BY total_revenue DESC
          `;

          const agentRows = await query(agentSql);
          const formatted = (agentRows as Record<string, unknown>[]).map((r) => ({
            Agent: r.agent,
            Deals: r.deals,
            Revenue: formatCurrency(Number(r.total_revenue)),
            "Avg Fee": formatCurrency(Number(r.avg_fee)),
          }));

          text += "\n\n## Revenue by Agent\n" + formatTable(formatted);
        }

        // Individual deals
        const dealsSql = `
          SELECT
            p.address,
            p.city,
            p.state,
            d.assignment_fee,
            d.contract_price,
            d.arv,
            d.closed_at,
            COALESCE(up.full_name, 'Unassigned') AS agent
          FROM deals d
            JOIN properties p ON d.property_id = p.id
            JOIN leads l ON d.lead_id = l.id
            LEFT JOIN user_profiles up ON l.assigned_to::text = up.id::text
          WHERE d.status = 'closed' AND d.closed_at >= ${since}
          ORDER BY d.closed_at DESC
          LIMIT 20
        `;

        const dealRows = await query(dealsSql);
        if (dealRows.length > 0) {
          const formatted = (dealRows as Record<string, unknown>[]).map((r) => ({
            Address: r.address,
            City: r.city,
            "Assign. Fee": formatCurrency(Number(r.assignment_fee ?? 0)),
            "Contract": formatCurrency(Number(r.contract_price ?? 0)),
            ARV: formatCurrency(Number(r.arv ?? 0)),
            Closed: r.closed_at ? String(r.closed_at).slice(0, 10) : "—",
            Agent: r.agent,
          }));
          text += "\n\n## Closed Deals\n" + formatTable(formatted);
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
