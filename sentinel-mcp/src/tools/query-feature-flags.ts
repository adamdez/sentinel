/**
 * query_feature_flags — List feature flags from the control plane.
 *
 * Read-only. Used by agents to check their own enable/mode state
 * and by Claude Code for system health checks.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { query } from "../db.js";

export function registerQueryFeatureFlags(server: McpServer): void {
  server.tool(
    "query_feature_flags",
    "List all feature flags or check a specific flag. " +
    "Shows enabled state, mode (off/shadow/review_required/auto), and metadata.",
    {
      flag_key: z.string().optional().describe("Specific flag key to check (e.g. 'agent.exception.enabled')"),
    },
    async (args) => {
      try {
        if (args.flag_key) {
          const rows = await query<Record<string, unknown>>(`
            SELECT flag_key, enabled, mode, description, metadata, updated_at
            FROM feature_flags
            WHERE flag_key = $1
          `, [args.flag_key]);

          if (!rows.length) {
            return {
              content: [{ type: "text", text: `Flag '${args.flag_key}' not found.` }],
            };
          }
          return {
            content: [{ type: "text", text: JSON.stringify(rows[0], null, 2) }],
          };
        }

        const rows = await query<Record<string, unknown>>(`
          SELECT flag_key, enabled, mode, description, updated_at
          FROM feature_flags
          ORDER BY flag_key
        `);

        return {
          content: [{ type: "text", text: JSON.stringify(rows, null, 2) }],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text", text: `Error querying feature flags: ${msg}` }],
          isError: true,
        };
      }
    },
  );
}
