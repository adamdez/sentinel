/**
 * ads_performance — Google Ads performance data.
 * Reads from ad_snapshots table (always available) and optionally
 * from the live Google Ads API if credentials are configured.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { query } from "../db.js";
import { formatTable, formatCurrency } from "../format.js";

export function registerAdsPerformance(server: McpServer): void {
  server.tool(
    "ads_performance",
    "Google Ads performance data. Shows campaign, ad group, ad, or keyword metrics. " +
    "Reads from cached snapshots in the database. " +
    "Includes: impressions, clicks, CTR, CPC, conversions, cost, ROAS, quality score.",
    {
      level: z.enum(["campaign", "ad", "keyword"]).optional().describe("Granularity level (default: campaign)"),
      campaign_name: z.string().optional().describe("Filter by campaign name (partial match)"),
      date_range: z.enum(["latest", "7d", "30d"]).optional().describe("Date range (default: latest snapshot)"),
      sort_by: z.enum(["cost", "clicks", "conversions", "ctr", "roas"]).optional().describe("Sort metric (default: cost)"),
    },
    async (args) => {
      try {
        const level = args.level ?? "campaign";
        const sortBy = args.sort_by ?? "cost";
        const dateRange = args.date_range ?? "latest";

        let dateFilter: string;
        if (dateRange === "latest") {
          dateFilter = "snapshot_date >= (SELECT MAX(snapshot_date) - INTERVAL '1 day' FROM ad_snapshots)";
        } else if (dateRange === "7d") {
          dateFilter = "snapshot_date >= CURRENT_DATE - INTERVAL '7 days'";
        } else {
          dateFilter = "snapshot_date >= CURRENT_DATE - INTERVAL '30 days'";
        }

        const conditions = [dateFilter];
        const params: unknown[] = [];
        let paramIdx = 1;

        if (args.campaign_name) {
          conditions.push(`campaign_name ILIKE $${paramIdx++}`);
          params.push(`%${args.campaign_name}%`);
        }

        const whereClause = "WHERE " + conditions.join(" AND ");

        if (level === "campaign") {
          const sql = `
            SELECT
              campaign_name,
              campaign_id,
              SUM(impressions)::int AS impressions,
              SUM(clicks)::int AS clicks,
              ROUND(100.0 * SUM(clicks) / NULLIF(SUM(impressions), 0), 2)::numeric AS ctr_pct,
              ROUND(SUM(cost) / NULLIF(SUM(clicks), 0), 2)::numeric AS avg_cpc,
              ROUND(SUM(conversions)::numeric, 1) AS conversions,
              ROUND(SUM(cost)::numeric, 2) AS total_cost,
              ROUND(SUM(conversions)::numeric / NULLIF(SUM(cost), 0) * 100, 2)::numeric AS roas
            FROM ad_snapshots
            ${whereClause}
            GROUP BY campaign_name, campaign_id
            ORDER BY ${sortBy === "ctr" ? "ctr_pct" : sortBy === "roas" ? "roas" : `total_${sortBy}`} DESC NULLS LAST
            LIMIT 20
          `;

          const rows = await query(sql, params);
          const formatted = (rows as Record<string, unknown>[]).map((r) => ({
            Campaign: r.campaign_name,
            Impressions: Number(r.impressions).toLocaleString(),
            Clicks: r.clicks,
            "CTR %": `${r.ctr_pct ?? 0}%`,
            "Avg CPC": `$${r.avg_cpc ?? 0}`,
            Conversions: r.conversions,
            Cost: `$${Number(r.total_cost ?? 0).toFixed(2)}`,
            ROAS: r.roas ?? "—",
          }));

          const totalCost = (rows as Record<string, unknown>[]).reduce((s, r) => s + Number(r.total_cost ?? 0), 0);
          const totalConv = (rows as Record<string, unknown>[]).reduce((s, r) => s + Number(r.conversions ?? 0), 0);

          const text = `## Campaign Performance (${dateRange})\n` +
            `**Total Spend:** $${totalCost.toFixed(2)} | **Total Conversions:** ${totalConv}\n\n` +
            formatTable(formatted);

          return { content: [{ type: "text", text }] };
        }

        if (level === "ad") {
          const sql = `
            SELECT
              campaign_name,
              ad_group_name,
              headline1, headline2, headline3,
              description1,
              SUM(impressions)::int AS impressions,
              SUM(clicks)::int AS clicks,
              ROUND(100.0 * SUM(clicks) / NULLIF(SUM(impressions), 0), 2)::numeric AS ctr_pct,
              ROUND(SUM(cost)::numeric, 2) AS total_cost,
              ROUND(SUM(conversions)::numeric, 1) AS conversions
            FROM ad_snapshots
            ${whereClause}
            AND ad_id IS NOT NULL AND ad_id != ''
            GROUP BY campaign_name, ad_group_name, headline1, headline2, headline3, description1
            ORDER BY total_cost DESC NULLS LAST
            LIMIT 20
          `;

          const rows = await query(sql, params);
          const formatted = (rows as Record<string, unknown>[]).map((r) => ({
            Campaign: r.campaign_name,
            "H1": r.headline1 ?? "—",
            "H2": r.headline2 ?? "—",
            Clicks: r.clicks,
            "CTR %": `${r.ctr_pct ?? 0}%`,
            Cost: `$${Number(r.total_cost ?? 0).toFixed(2)}`,
            Conv: r.conversions,
          }));

          return { content: [{ type: "text", text: `## Ad Performance (${dateRange})\n` + formatTable(formatted) }] };
        }

        // keyword level
        const sql = `
          SELECT
            campaign_name,
            ad_group_name,
            headline1 AS keyword_or_headline,
            SUM(impressions)::int AS impressions,
            SUM(clicks)::int AS clicks,
            ROUND(100.0 * SUM(clicks) / NULLIF(SUM(impressions), 0), 2)::numeric AS ctr_pct,
            ROUND(SUM(cost) / NULLIF(SUM(clicks), 0), 2)::numeric AS avg_cpc,
            ROUND(SUM(cost)::numeric, 2) AS total_cost,
            ROUND(SUM(conversions)::numeric, 1) AS conversions,
            MAX(quality_score)::int AS quality_score
          FROM ad_snapshots
          ${whereClause}
          GROUP BY campaign_name, ad_group_name, headline1
          ORDER BY total_cost DESC NULLS LAST
          LIMIT 30
        `;

        const rows = await query(sql, params);

        // Flag budget burners (spend > $10, 0 conversions)
        const formatted = (rows as Record<string, unknown>[]).map((r) => {
          const cost = Number(r.total_cost ?? 0);
          const conv = Number(r.conversions ?? 0);
          const isBurner = cost > 10 && conv === 0;
          return {
            Campaign: r.campaign_name,
            "Ad Group": r.ad_group_name,
            Clicks: r.clicks,
            "CTR %": `${r.ctr_pct ?? 0}%`,
            "Avg CPC": `$${r.avg_cpc ?? 0}`,
            Cost: `$${cost.toFixed(2)}`,
            Conv: r.conversions,
            QS: r.quality_score ?? "—",
            Flag: isBurner ? "🔥 BURNER" : "",
          };
        });

        return { content: [{ type: "text", text: `## Keyword/Ad Group Performance (${dateRange})\n` + formatTable(formatted) }] };
      } catch (err) {
        return {
          content: [{ type: "text", text: `**Error:** ${err instanceof Error ? err.message : String(err)}` }],
          isError: true,
        };
      }
    },
  );
}
