/**
 * lead_context — Context Snapshot for a single lead.
 *
 * The primary tool for the dialer workspace and agent fleet.
 * Assembles everything an operator or agent needs before a call:
 *   - Seller identity + contact info
 *   - Property details
 *   - Compliance flags (DNC, opt-out, litigant)
 *   - Qualification state (motivation, timeline, route)
 *   - Communication history (call counts, last contact)
 *   - Latest AI score
 *   - Open tasks
 *   - Recent call notes
 *   - Active reviewed dossier summary
 *   - Current next_action + allowed stage transitions
 *
 * One-directional read. This tool never writes.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { query } from "../db.js";

export function registerLeadContext(server: McpServer): void {
  server.tool(
    "lead_context",
    "Returns the full context snapshot for a lead — seller identity, property, compliance flags, " +
    "qualification state, call history, open tasks, dossier summary, and allowed stage transitions. " +
    "Use this before any call or agent run. One-directional read — never writes.",
    {
      lead_id: z.string().uuid().describe("Lead UUID"),
    },
    async (args) => {
      try {
        // ── Core lead + property + contact ──────────────────────────
        const leads = await query<Record<string, unknown>>(`
          SELECT
            l.id,
            l.status,
            l.next_action,
            l.next_action_due_at,
            l.lock_version,
            l.source,
            l.assigned_to,
            l.tags,
            l.notes,
            l.motivation_level,
            l.seller_timeline,
            l.qualification_route,
            l.price_expectation,
            l.decision_maker_confirmed,
            l.total_calls,
            l.live_answers,
            l.voicemails_left,
            l.last_contact_at,
            l.next_follow_up_at,
            l.next_call_scheduled_at,
            -- Property
            p.address,
            p.city,
            p.state,
            p.zip,
            p.county,
            p.owner_name,
            p.owner_phone,
            p.owner_email,
            p.estimated_value,
            p.equity_percent,
            p.property_type,
            p.bedrooms,
            p.year_built,
            -- Contact (compliance)
            c.dnc_status,
            c.opt_out,
            c.litigant_flag,
            l.call_consent,
            -- Assigned user name
            u.full_name AS assigned_to_name
          FROM leads l
          JOIN properties p ON p.id = l.property_id
          LEFT JOIN contacts c ON c.id = l.contact_id
          LEFT JOIN user_profiles u ON u.id = l.assigned_to
          WHERE l.id = $1
        `, [args.lead_id]);

        if (!leads.length) {
          return {
            content: [{ type: "text", text: `Lead ${args.lead_id} not found.` }],
            isError: true,
          };
        }

        const lead = leads[0];

        // ── Latest score ─────────────────────────────────────────────
        const scores = await query<Record<string, unknown>>(`
          SELECT composite_score, factors
          FROM scoring_records
          WHERE property_id = (SELECT property_id FROM leads WHERE id = $1)
          ORDER BY created_at DESC
          LIMIT 1
        `, [args.lead_id]);

        const score = scores[0] ?? null;

        // ── Open tasks ───────────────────────────────────────────────
        const tasks = await query<Record<string, unknown>>(`
          SELECT id, title, due_at, priority
          FROM tasks
          WHERE lead_id = $1
            AND status NOT IN ('completed', 'cancelled')
          ORDER BY COALESCE(due_at, '9999-01-01'::timestamptz), priority DESC
          LIMIT 5
        `, [args.lead_id]);

        // ── Recent calls (last 3) ────────────────────────────────────
        const calls = await query<Record<string, unknown>>(`
          SELECT id, outcome, duration_seconds, created_at AS called_at, notes
          FROM calls_log
          WHERE lead_id = $1
          ORDER BY created_at DESC
          LIMIT 3
        `, [args.lead_id]);

        // ── Active dossier ────────────────────────────────────────────
        const dossiers = await query<Record<string, unknown>>(`
          SELECT id, situation_summary, recommended_call_angle, top_facts
          FROM dossiers
          WHERE lead_id = $1
            AND status = 'reviewed'
          ORDER BY created_at DESC
          LIMIT 1
        `, [args.lead_id]);

        const dossier = dossiers[0] ?? null;

        // ── Stage transition options ──────────────────────────────────
        const ALLOWED_TRANSITIONS: Record<string, string[]> = {
          staging: ["prospect", "dead"],
          prospect: ["lead", "negotiation", "nurture", "dead"],
          lead: ["qualified", "negotiation", "nurture", "dead"],
          qualified: ["negotiation", "nurture", "dead"],
          negotiation: ["disposition", "nurture", "dead"],
          disposition: ["closed", "nurture", "dead"],
          nurture: ["lead", "qualified", "dead"],
          dead: ["nurture"],
          closed: [],
        };

        const REQUIRES_NEXT_ACTION = new Set(["prospect", "lead", "qualified", "negotiation", "disposition"]);
        const currentStatus = String(lead.status);
        const allowedTransitions = (ALLOWED_TRANSITIONS[currentStatus] ?? []).map((s) => ({
          status: s,
          requires_next_action: REQUIRES_NEXT_ACTION.has(s),
        }));

        // ── Assemble snapshot ────────────────────────────────────────
        const snapshot = {
          lead_id: lead.id,
          status: lead.status,
          next_action: lead.next_action,
          next_action_due_at: lead.next_action_due_at,
          lock_version: lead.lock_version,
          // Seller identity
          owner_name: lead.owner_name,
          owner_phone: lead.owner_phone,
          owner_email: lead.owner_email,
          // Property
          address: lead.address,
          city: lead.city,
          state: lead.state,
          zip: lead.zip,
          county: lead.county,
          estimated_value: lead.estimated_value,
          equity_percent: lead.equity_percent,
          property_type: lead.property_type,
          bedrooms: lead.bedrooms,
          year_built: lead.year_built,
          // Compliance
          dnc_status: lead.dnc_status ?? false,
          opt_out: lead.opt_out ?? false,
          call_consent: lead.call_consent ?? false,
          litigant_flag: lead.litigant_flag ?? false,
          // Qualification
          motivation_level: lead.motivation_level,
          seller_timeline: lead.seller_timeline,
          qualification_route: lead.qualification_route,
          price_expectation: lead.price_expectation,
          decision_maker_confirmed: lead.decision_maker_confirmed ?? false,
          // Communication
          total_calls: lead.total_calls ?? 0,
          live_answers: lead.live_answers ?? 0,
          voicemails_left: lead.voicemails_left ?? 0,
          last_contact_at: lead.last_contact_at,
          next_follow_up_at: lead.next_follow_up_at,
          next_call_scheduled_at: lead.next_call_scheduled_at,
          // Score
          composite_score: score ? Number(score.composite_score) : null,
          score_factors: score ? (score.factors as Array<{ name: string; contribution: number }> ?? null) : null,
          // Tasks
          open_tasks: tasks.map((t) => ({
            id: t.id,
            title: t.title,
            due_at: t.due_at,
            priority: t.priority,
          })),
          // Calls
          recent_calls: calls.map((c) => ({
            id: c.id,
            outcome: c.outcome,
            duration_seconds: c.duration_seconds,
            called_at: c.called_at,
            notes: c.notes,
          })),
          // Dossier
          dossier: dossier ? {
            id: dossier.id,
            situation_summary: dossier.situation_summary,
            recommended_call_angle: dossier.recommended_call_angle,
            top_facts: dossier.top_facts,
          } : null,
          // Stage transitions
          allowed_transitions: allowedTransitions,
          // Meta
          source: lead.source,
          assigned_to: lead.assigned_to,
          assigned_to_name: lead.assigned_to_name,
          tags: lead.tags,
          notes: lead.notes,
        };

        // Compliance warning
        const complianceWarnings: string[] = [];
        if (snapshot.dnc_status) complianceWarnings.push("DNC — DO NOT CALL");
        if (snapshot.opt_out) complianceWarnings.push("OPT-OUT — DO NOT CONTACT");
        if (snapshot.litigant_flag) complianceWarnings.push("LITIGANT FLAG — ESCALATE BEFORE CONTACT");

        const complianceBlock = complianceWarnings.length > 0
          ? `\n⚠️  COMPLIANCE ALERT: ${complianceWarnings.join(" | ")}\n`
          : "";

        const text = `${complianceBlock}${JSON.stringify(snapshot, null, 2)}`;

        return {
          content: [{ type: "text", text }],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text", text: `Error loading lead context: ${msg}` }],
          isError: true,
        };
      }
    },
  );
}
