/**
 * update_next_action — Update the next_action on a lead.
 *
 * Used by the dialer agent and Exception Agent to update what's
 * needed for a lead after a call or analysis. Enforces optimistic
 * locking so the operator's in-progress session doesn't get overwritten.
 *
 * This is NOT a stage transition — it only updates next_action and
 * next_action_due_at without changing the lead's status.
 * For stage transitions, use PATCH /api/leads/[id]/stage.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { writeQuery, query } from "../db.js";

export function registerUpdateNextAction(server: McpServer): void {
  server.tool(
    "update_next_action",
    "Update the next_action and optionally next_action_due_at on a lead. " +
    "Does NOT change the lead's stage. Requires current lock_version for optimistic locking. " +
    "Use after calls or analysis to record what happens next for this lead.",
    {
      lead_id: z.string().uuid().describe("Lead UUID"),
      next_action: z.string().min(3).max(1000).describe("What needs to happen next — imperative, specific, actionable"),
      next_action_due_at: z.string().optional().describe("ISO 8601 deadline for this action, e.g. '2026-03-22T09:00:00Z'"),
      lock_version: z.number().int().describe("Current lock_version from lead_context tool — required for concurrency safety"),
    },
    async (args) => {
      try {
        // ── Verify lock version ──────────────────────────────────────
        const current = await query<{ lock_version: number; status: string }>(`
          SELECT lock_version, status FROM leads WHERE id = $1
        `, [args.lead_id]);

        if (!current.length) {
          return {
            content: [{ type: "text", text: `Lead ${args.lead_id} not found.` }],
            isError: true,
          };
        }

        if (current[0].lock_version !== args.lock_version) {
          return {
            content: [{
              type: "text",
              text: `Lock conflict: expected version ${args.lock_version}, found ${current[0].lock_version}. Re-fetch lead_context and retry.`,
            }],
            isError: true,
          };
        }

        const newLockVersion = args.lock_version + 1;

        const rows = await writeQuery<{ id: string; next_action: string | null; lock_version: number }>(`
          UPDATE leads
          SET
            next_action = $1,
            next_action_due_at = $2,
            lock_version = $3,
            updated_at = NOW()
          WHERE id = $4
            AND lock_version = $5
          RETURNING id, next_action, lock_version
        `, [
          args.next_action,
          args.next_action_due_at ?? null,
          newLockVersion,
          args.lead_id,
          args.lock_version,
        ]);

        if (!rows.length) {
          return {
            content: [{ type: "text", text: "Lock conflict — no rows updated. Re-fetch lead_context and retry." }],
            isError: true,
          };
        }

        return {
          content: [{
            type: "text",
            text: `next_action updated for lead ${args.lead_id}: "${rows[0].next_action}" (lock_version now: ${rows[0].lock_version})`,
          }],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text", text: `Error updating next_action: ${msg}` }],
          isError: true,
        };
      }
    },
  );
}
