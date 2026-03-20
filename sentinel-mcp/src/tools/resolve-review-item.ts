/**
 * resolve_review_item — Approve or reject a review queue proposal.
 *
 * When approved, the backend executes the proposed action (sync dossier,
 * accept facts, etc.) via resolveReviewItem in control-plane.ts.
 *
 * Write path:
 *   review_queue.status → 'approved'|'rejected'
 *   If approved → dispatches action (sync_dossier_to_lead, accept_facts, etc.)
 *
 * This tool is the MCP equivalent of PATCH /api/control-plane/review-queue.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { writeQuery, readQuery } from "../db.js";

export function registerResolveReviewItem(server: McpServer): void {
  server.tool(
    "resolve_review_item",
    "Approve or reject an agent proposal in the review queue. Approved proposals are " +
    "automatically executed (e.g., sync dossier to lead, accept facts). Use query_review_queue " +
    "first to see pending proposals, then call this with the item ID and decision.",
    {
      item_id: z.string().uuid().describe("UUID of the review queue item to resolve"),
      decision: z.enum(["approved", "rejected"]).describe("Whether to approve or reject the proposal"),
      review_notes: z.string().max(1000).optional().describe("Optional notes explaining the decision"),
    },
    async (args) => {
      try {
        // Verify item exists and is pending
        const items = await readQuery<{
          id: string;
          status: string;
          agent_name: string;
          action: string;
          entity_type: string;
          entity_id: string | null;
          proposal: Record<string, unknown>;
          rationale: string | null;
        }>(`
          SELECT id, status, agent_name, action, entity_type, entity_id, proposal, rationale
          FROM review_queue WHERE id = $1
        `, [args.item_id]);

        if (items.length === 0) {
          return {
            content: [{ type: "text", text: `Error: Review item ${args.item_id} not found.` }],
            isError: true,
          };
        }

        const item = items[0];
        if (item.status !== "pending") {
          return {
            content: [{ type: "text", text: `Error: Item already resolved (status: ${item.status}).` }],
            isError: true,
          };
        }

        // Update the review queue item
        await writeQuery(`
          UPDATE review_queue SET
            status = $1,
            reviewed_by = NULL,
            reviewed_at = NOW(),
            review_notes = $2,
            updated_at = NOW()
          WHERE id = $3 AND status = 'pending'
        `, [args.decision, args.review_notes ?? null, args.item_id]);

        // If approved, execute the action
        let executionResult = "";
        if (args.decision === "approved") {
          executionResult = await executeAction(item);
        }

        const summary = args.decision === "approved"
          ? `Approved: ${item.agent_name} → ${item.action}. ${executionResult}`
          : `Rejected: ${item.agent_name} → ${item.action}. ${args.review_notes ?? "No notes."}`;

        return {
          content: [{ type: "text", text: summary }],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text", text: `Error resolving review item: ${msg}` }],
          isError: true,
        };
      }
    },
  );
}

async function executeAction(item: {
  action: string;
  entity_id: string | null;
  proposal: Record<string, unknown>;
}): Promise<string> {
  switch (item.action) {
    case "sync_dossier_to_lead": {
      const dossierId = item.entity_id ?? (item.proposal.dossierId as string);
      if (!dossierId) return "No dossier ID — skipped execution.";

      // Verify dossier is reviewed before syncing
      const dossiers = await readQuery<{ status: string; lead_id: string }>(`
        SELECT status, lead_id FROM dossiers WHERE id = $1
      `, [dossierId]);

      if (dossiers.length === 0) return "Dossier not found.";
      if (dossiers[0].status !== "reviewed") return `Dossier status is '${dossiers[0].status}', must be 'reviewed'.`;

      await writeQuery(`
        UPDATE leads SET current_dossier_id = $1, updated_at = NOW()
        WHERE id = $2
      `, [dossierId, dossiers[0].lead_id]);

      return `Synced dossier ${dossierId} to lead ${dossiers[0].lead_id}.`;
    }

    case "accept_facts": {
      const factIds = (item.proposal.factIds as string[]) ?? [];
      if (factIds.length === 0) return "No fact IDs to accept.";

      await writeQuery(`
        UPDATE fact_assertions SET review_status = 'accepted', reviewed_at = NOW(), updated_at = NOW()
        WHERE id = ANY($1) AND review_status = 'pending'
      `, [factIds]);

      return `Accepted ${factIds.length} facts.`;
    }

    case "reject_facts": {
      const factIds = (item.proposal.factIds as string[]) ?? [];
      if (factIds.length === 0) return "No fact IDs to reject.";

      await writeQuery(`
        UPDATE fact_assertions SET review_status = 'rejected', reviewed_at = NOW(), updated_at = NOW()
        WHERE id = ANY($1) AND review_status = 'pending'
      `, [factIds]);

      return `Rejected ${factIds.length} facts.`;
    }

    case "review_dossier": {
      const dossierId = item.entity_id ?? (item.proposal.dossierId as string);
      const status = (item.proposal.decision as string) ?? "reviewed";
      if (!dossierId) return "No dossier ID.";

      await writeQuery(`
        UPDATE dossiers SET status = $1, reviewed_at = NOW(), updated_at = NOW()
        WHERE id = $2
      `, [status, dossierId]);

      return `Dossier ${dossierId} marked as '${status}'.`;
    }

    default:
      return `Unknown action '${item.action}' — no execution performed.`;
  }
}
