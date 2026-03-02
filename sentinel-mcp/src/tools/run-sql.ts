/**
 * run_sql — Arbitrary read-only SQL escape hatch.
 * Safety: Validates query starts with SELECT/WITH, blocks mutation keywords,
 * and the db.ts layer wraps in BEGIN READ ONLY with 10s timeout.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { query } from "../db.js";
import { maskRows } from "../masking.js";
import { formatTable } from "../format.js";

const BLOCKED_KEYWORDS = [
  /\bINSERT\b/i, /\bUPDATE\b/i, /\bDELETE\b/i, /\bDROP\b/i,
  /\bCREATE\b/i, /\bALTER\b/i, /\bTRUNCATE\b/i, /\bGRANT\b/i,
  /\bREVOKE\b/i, /\bEXECUTE\b/i, /\bCALL\b/i, /\bCOPY\b/i,
];

function validateSql(sql: string): void {
  const normalized = sql.trim().replace(/\s+/g, " ");

  if (!/^(SELECT|WITH)\s/i.test(normalized)) {
    throw new Error("Only SELECT queries are allowed. Query must start with SELECT or WITH.");
  }

  for (const pattern of BLOCKED_KEYWORDS) {
    if (pattern.test(normalized)) {
      throw new Error(`Blocked keyword detected: ${pattern.source}. Only read-only queries allowed.`);
    }
  }

  // Strip trailing semicolon, then check for remaining semicolons
  const withoutTrailing = normalized.replace(/;\s*$/, "");
  if (withoutTrailing.includes(";")) {
    throw new Error("Multiple statements not allowed. Remove extra semicolons.");
  }
}

export function registerRunSql(server: McpServer): void {
  server.tool(
    "run_sql",
    "Execute arbitrary read-only SQL against the Sentinel database. " +
    "Must start with SELECT or WITH. Mutation keywords are blocked. " +
    "Use the sentinel://schema resource to understand table structures. " +
    "Results are auto-masked for PII (phone/email).",
    {
      sql: z.string().describe("The SQL query to execute. Must be a SELECT or WITH query."),
    },
    async ({ sql: rawSql }) => {
      try {
        const sql = rawSql.trim().replace(/;\s*$/, "");
        validateSql(sql);

        const rows = await query(sql);
        const masked = maskRows(rows as Record<string, unknown>[]);
        const text = formatTable(masked, 100);

        return {
          content: [{ type: "text", text: `**Query:** \`${sql.slice(0, 200)}\`\n\n${text}` }],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text", text: `**Error:** ${msg}` }],
          isError: true,
        };
      }
    },
  );
}
