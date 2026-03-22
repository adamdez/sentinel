/**
 * promote_session_facts — Promote confirmed call session facts into the intel pipeline.
 *
 * Bridges the dialer domain (volatile) to the intelligence layer (durable).
 * Creates a dossier_artifact (provenance) + fact_assertion (reviewable claim)
 * for each confirmed session fact.
 *
 * Write path:
 *   session_extracted_facts (read) → dossier_artifacts (insert) → fact_assertions (insert)
 *
 * This tool is the MCP equivalent of POST /api/dialer/v1/sessions/[id]/promote-facts.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { query as readQuery, writeQuery } from "../db.js";

/** Maps dialer session fact types to intel pipeline fact types */
const FACT_TYPE_MAP: Record<string, string> = {
  motivation_signal: "seller_motivation",
  price_mention: "asking_price",
  timeline_mention: "seller_timeline",
  condition_note: "property_condition",
  objection: "seller_objection",
  follow_up_intent: "follow_up_signal",
  red_flag: "red_flag",
};

export function registerPromoteSessionFacts(server: McpServer): void {
  server.tool(
    "promote_session_facts",
    "Promote confirmed facts from a dialer call session into the intelligence pipeline. " +
    "Only promotes facts where is_confirmed = true. Creates artifacts (provenance) and " +
    "fact assertions (reviewable claims) in the intel layer. The session must have a linked lead.",
    {
      session_id: z.string().uuid().describe("UUID of the call_sessions row to promote facts from"),
    },
    async (args) => {
      try {
        // Get session and verify it has a lead
        const sessions = await readQuery<{ id: string; lead_id: string | null }>(`
          SELECT id, lead_id FROM call_sessions WHERE id = $1
        `, [args.session_id]);

        if (sessions.length === 0) {
          return {
            content: [{ type: "text", text: `Error: Session ${args.session_id} not found.` }],
            isError: true,
          };
        }

        const session = sessions[0];
        if (!session.lead_id) {
          return {
            content: [{ type: "text", text: "Error: Session has no linked lead — cannot promote facts." }],
            isError: true,
          };
        }

        // Fetch confirmed facts
        const facts = await readQuery<{
          id: string;
          fact_type: string;
          raw_text: string;
          structured_value: Record<string, unknown> | null;
        }>(`
          SELECT id, fact_type, raw_text, structured_value
          FROM session_extracted_facts
          WHERE session_id = $1 AND is_confirmed = true
        `, [args.session_id]);

        if (facts.length === 0) {
          return {
            content: [{ type: "text", text: "No confirmed facts to promote in this session." }],
          };
        }

        // Promote each fact
        let promoted = 0;
        let contradictions = 0;

        for (const fact of facts) {
          // Create artifact for provenance
          const artifacts = await writeQuery<{ id: string }>(`
            INSERT INTO dossier_artifacts (lead_id, source_type, source_label, extracted_notes, raw_excerpt)
            VALUES ($1, 'call_session', $2, $3, $4)
            RETURNING id
          `, [
            session.lead_id,
            `Call session ${args.session_id}`,
            fact.raw_text,
            fact.structured_value ? JSON.stringify(fact.structured_value) : fact.raw_text,
          ]);

          const artifactId = artifacts[0].id;
          const intelFactType = FACT_TYPE_MAP[fact.fact_type] ?? fact.fact_type;
          const factValue = fact.structured_value ? JSON.stringify(fact.structured_value) : fact.raw_text;

          // Check for contradictions
          const existing = await readQuery<{ id: string; fact_value: string }>(`
            SELECT id, fact_value FROM fact_assertions
            WHERE lead_id = $1 AND fact_type = $2 AND review_status = 'accepted' AND fact_value != $3
          `, [session.lead_id, intelFactType, factValue]);

          if (existing.length > 0) contradictions++;

          // Create fact assertion
          await writeQuery(`
            INSERT INTO fact_assertions (artifact_id, lead_id, fact_type, fact_value, confidence, review_status)
            VALUES ($1, $2, $3, $4, 'medium', 'pending')
          `, [artifactId, session.lead_id, intelFactType, factValue]);

          promoted++;
        }

        const summary = `Promoted ${promoted} facts from session ${args.session_id} to intel pipeline for lead ${session.lead_id}.` +
          (contradictions > 0 ? ` ${contradictions} fact(s) conflict with existing accepted data — review recommended.` : "");

        return {
          content: [{ type: "text", text: summary }],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text", text: `Error promoting facts: ${msg}` }],
          isError: true,
        };
      }
    },
  );
}
