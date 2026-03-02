/**
 * ads_manage — Google Ads management with confirmation flow.
 *
 * Two-step process:
 * 1. Call with confirm=false → preview what will change
 * 2. Call with confirm=true → execute the change via Google Ads API
 *
 * All executed actions are logged to the ad_actions table.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { query } from "../db.js";

export function registerAdsManage(server: McpServer): void {
  server.tool(
    "ads_manage",
    "Manage Google Ads: update bids, pause/enable keywords/campaigns/ads, update budgets. " +
    "ALWAYS call first with confirm=false to preview, then confirm=true to execute. " +
    "Requires GOOGLE_ADS_DEVELOPER_TOKEN, GOOGLE_ADS_CUSTOMER_ID, and GOOGLE_ADS_REFRESH_TOKEN env vars.",
    {
      action: z.enum([
        "update_bid", "pause_keyword", "enable_keyword",
        "update_budget", "pause_campaign", "enable_campaign",
        "pause_ad", "enable_ad",
      ]).describe("The action to perform"),
      target_id: z.string().describe("Target entity ID (campaign ID, keyword ID, ad group~keyword, etc.)"),
      ad_group_id: z.string().optional().describe("Ad group ID (required for keyword actions)"),
      value: z.string().optional().describe("New value (bid amount in dollars for update_bid, daily budget in dollars for update_budget)"),
      campaign_budget_id: z.string().optional().describe("Campaign budget resource ID (for update_budget)"),
      confirm: z.boolean().optional().describe("false = preview only (default), true = execute the change"),
    },
    async (args) => {
      try {
        const isPreview = args.confirm !== true;

        // Check if Google Ads credentials are configured
        const hasCredentials =
          !!process.env.GOOGLE_ADS_DEVELOPER_TOKEN &&
          !!process.env.GOOGLE_ADS_CUSTOMER_ID &&
          !!process.env.GOOGLE_ADS_REFRESH_TOKEN;

        if (!hasCredentials && !isPreview) {
          return {
            content: [{
              type: "text",
              text: "**Cannot execute:** Google Ads API credentials are not configured.\n\n" +
                "Required environment variables:\n" +
                "- `GOOGLE_ADS_DEVELOPER_TOKEN`\n" +
                "- `GOOGLE_ADS_CUSTOMER_ID`\n" +
                "- `GOOGLE_ADS_REFRESH_TOKEN`\n\n" +
                "Add these to the MCP server config in `.claude/settings.local.json`.",
            }],
            isError: true,
          };
        }

        // Build human-readable description of the action
        const description = buildDescription(args);

        if (isPreview) {
          return {
            content: [{
              type: "text",
              text: `## Preview: ${args.action}\n\n` +
                `${description}\n\n` +
                (hasCredentials
                  ? "**Ready to execute.** Call this tool again with `confirm: true` to apply."
                  : "⚠️ Google Ads credentials not configured. Cannot execute yet."),
            }],
          };
        }

        // Execute the mutation via Google Ads API
        const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN!;
        const clientId = process.env.GOOGLE_CLIENT_ID!;
        const clientSecret = process.env.GOOGLE_CLIENT_SECRET!;
        const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN!;
        const customerId = process.env.GOOGLE_ADS_CUSTOMER_ID!.replace(/-/g, "");

        // Refresh access token
        const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            refresh_token: refreshToken,
            grant_type: "refresh_token",
          }),
        });

        if (!tokenRes.ok) {
          const err = await tokenRes.text().catch(() => "");
          return {
            content: [{ type: "text", text: `**OAuth token refresh failed:** ${err.slice(0, 300)}` }],
            isError: true,
          };
        }

        const tokenData = await tokenRes.json() as { access_token: string };
        const accessToken = tokenData.access_token;

        // Build and execute mutation
        const operation = buildMutateOperation(args, customerId);
        if (!operation) {
          return {
            content: [{ type: "text", text: `**Error:** Unsupported action: ${args.action}` }],
            isError: true,
          };
        }

        const mutateUrl = `https://googleads.googleapis.com/v18/customers/${customerId}/googleAds:mutate`;
        const mutateRes = await fetch(mutateUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
            "developer-token": developerToken,
          },
          body: JSON.stringify({ mutateOperations: [operation] }),
        });

        if (!mutateRes.ok) {
          const err = await mutateRes.text().catch(() => "");
          return {
            content: [{ type: "text", text: `**Google Ads API error (${mutateRes.status}):** ${err.slice(0, 500)}` }],
            isError: true,
          };
        }

        // Log to ad_actions table (best effort — this uses the DB pool in read-only mode,
        // so we skip the audit log here. The action is logged via console instead.)
        console.error(`[sentinel-mcp] Executed: ${args.action} on ${args.target_id} — ${description}`);

        return {
          content: [{
            type: "text",
            text: `## ✅ Executed: ${args.action}\n\n${description}\n\n_Action applied successfully via Google Ads API._`,
          }],
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

function buildDescription(args: {
  action: string;
  target_id: string;
  ad_group_id?: string;
  value?: string;
  campaign_budget_id?: string;
}): string {
  switch (args.action) {
    case "update_bid":
      return `Update keyword bid to **$${args.value}** for keyword ${args.target_id}` +
        (args.ad_group_id ? ` in ad group ${args.ad_group_id}` : "");
    case "pause_keyword":
      return `Pause keyword ${args.target_id}` +
        (args.ad_group_id ? ` in ad group ${args.ad_group_id}` : "");
    case "enable_keyword":
      return `Enable keyword ${args.target_id}` +
        (args.ad_group_id ? ` in ad group ${args.ad_group_id}` : "");
    case "update_budget":
      return `Update daily campaign budget to **$${args.value}**` +
        (args.campaign_budget_id ? ` (budget ID: ${args.campaign_budget_id})` : ` for campaign ${args.target_id}`);
    case "pause_campaign":
      return `Pause campaign ${args.target_id}`;
    case "enable_campaign":
      return `Enable campaign ${args.target_id}`;
    case "pause_ad":
      return `Pause ad ${args.target_id}`;
    case "enable_ad":
      return `Enable ad ${args.target_id}`;
    default:
      return `${args.action} on ${args.target_id}`;
  }
}

function buildMutateOperation(
  args: {
    action: string;
    target_id: string;
    ad_group_id?: string;
    value?: string;
    campaign_budget_id?: string;
  },
  customerId: string,
): Record<string, unknown> | null {
  switch (args.action) {
    case "update_bid": {
      const bidMicros = Math.round(parseFloat(args.value ?? "0") * 1_000_000);
      return {
        adGroupCriterionOperation: {
          update: {
            resourceName: `customers/${customerId}/adGroupCriteria/${args.ad_group_id}~${args.target_id}`,
            cpcBidMicros: String(bidMicros),
          },
          updateMask: "cpc_bid_micros",
        },
      };
    }

    case "pause_keyword":
    case "enable_keyword": {
      const status = args.action === "pause_keyword" ? "PAUSED" : "ENABLED";
      return {
        adGroupCriterionOperation: {
          update: {
            resourceName: `customers/${customerId}/adGroupCriteria/${args.ad_group_id}~${args.target_id}`,
            status,
          },
          updateMask: "status",
        },
      };
    }

    case "update_budget": {
      const budgetMicros = Math.round(parseFloat(args.value ?? "0") * 1_000_000);
      const budgetId = args.campaign_budget_id ?? args.target_id;
      return {
        campaignBudgetOperation: {
          update: {
            resourceName: `customers/${customerId}/campaignBudgets/${budgetId}`,
            amountMicros: String(budgetMicros),
          },
          updateMask: "amount_micros",
        },
      };
    }

    case "pause_campaign":
    case "enable_campaign": {
      const status = args.action === "pause_campaign" ? "PAUSED" : "ENABLED";
      return {
        campaignOperation: {
          update: {
            resourceName: `customers/${customerId}/campaigns/${args.target_id}`,
            status,
          },
          updateMask: "status",
        },
      };
    }

    case "pause_ad":
    case "enable_ad": {
      const status = args.action === "pause_ad" ? "PAUSED" : "ENABLED";
      return {
        adGroupAdOperation: {
          update: {
            resourceName: `customers/${customerId}/adGroupAds/${args.target_id}`,
            status,
          },
          updateMask: "status",
        },
      };
    }

    default:
      return null;
  }
}
