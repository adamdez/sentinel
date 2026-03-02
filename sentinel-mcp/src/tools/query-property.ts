/**
 * query_property — Deep dive on a single property.
 * Pulls all related data in one call: property details, lead status,
 * distress events, scoring, predictions, deals, call history.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { query } from "../db.js";
import { maskRow } from "../masking.js";
import { formatTable, formatCurrency } from "../format.js";

export function registerQueryProperty(server: McpServer): void {
  server.tool(
    "query_property",
    "Deep dive on a single property — all related data in one call. " +
    "Provide id, apn, or address (partial match). Returns property details, " +
    "lead status, distress events, scores, predictions, deals, and call history.",
    {
      id: z.string().optional().describe("Property UUID"),
      apn: z.string().optional().describe("APN (exact or partial)"),
      address: z.string().optional().describe("Address substring search"),
    },
    async (args) => {
      try {
        if (!args.id && !args.apn && !args.address) {
          return {
            content: [{ type: "text", text: "**Error:** Provide at least one of: id, apn, or address" }],
            isError: true,
          };
        }

        // 1. Find the property
        let propSql: string;
        let propParams: unknown[];

        if (args.id) {
          propSql = "SELECT * FROM properties WHERE id = $1 LIMIT 1";
          propParams = [args.id];
        } else if (args.apn) {
          propSql = "SELECT * FROM properties WHERE apn ILIKE $1 LIMIT 1";
          propParams = [`%${args.apn}%`];
        } else {
          propSql = "SELECT * FROM properties WHERE address ILIKE $1 ORDER BY created_at DESC LIMIT 1";
          propParams = [`%${args.address}%`];
        }

        const [prop] = await query(propSql, propParams);
        if (!prop) {
          return { content: [{ type: "text", text: "**No property found** matching the given criteria." }] };
        }

        const p = maskRow(prop as Record<string, unknown>);
        const propertyId = p.id as string;

        let text = `## Property: ${p.address}\n` +
          `**City:** ${p.city}, ${p.state} ${p.zip} | **County:** ${p.county}\n` +
          `**APN:** ${p.apn} | **Type:** ${p.property_type ?? "—"}\n` +
          `**Owner:** ${p.owner_name} | **Phone:** ${p.owner_phone ?? "—"}\n` +
          `**Value:** ${formatCurrency(Number(p.estimated_value ?? 0))} | **Equity:** ${p.equity_percent ?? "—"}%\n` +
          `**Bed/Bath/Sqft:** ${p.bedrooms ?? "—"}/${p.bathrooms ?? "—"}/${p.sqft ? Number(p.sqft).toLocaleString() : "—"} | **Year:** ${p.year_built ?? "—"}`;

        // 2. Lead status
        const leads = await query(
          `SELECT l.*, up.full_name AS assigned_name
           FROM leads l LEFT JOIN user_profiles up ON l.assigned_to::text = up.id::text
           WHERE l.property_id = $1 ORDER BY l.created_at DESC`,
          [propertyId],
        );

        if (leads.length > 0) {
          const l = leads[0] as Record<string, unknown>;
          text += `\n\n## Lead Status\n` +
            `**Status:** ${l.status} | **Assigned:** ${l.assigned_name ?? "Unassigned"} | **Source:** ${l.source ?? "—"}\n` +
            `**Priority/Score:** ${l.priority} | **Call Step:** ${l.call_sequence_step}/7 | **Total Calls:** ${l.total_calls}\n` +
            `**Last Contact:** ${l.last_contact_at ? String(l.last_contact_at).slice(0, 10) : "Never"}\n` +
            `**Next Follow-up:** ${l.next_follow_up_at ? String(l.next_follow_up_at).slice(0, 10) : "—"}\n` +
            `**Tags:** ${Array.isArray(l.tags) && l.tags.length > 0 ? (l.tags as string[]).join(", ") : "—"}\n` +
            `**Notes:** ${l.notes ?? "—"}`;
        } else {
          text += "\n\n## Lead Status\n_No lead record for this property._";
        }

        // 3. Distress events
        const distress = await query(
          `SELECT event_type, source, severity, confidence, created_at
           FROM distress_events WHERE property_id = $1 ORDER BY created_at DESC`,
          [propertyId],
        );

        text += `\n\n## Distress Signals (${distress.length})`;
        if (distress.length > 0) {
          const formatted = (distress as Record<string, unknown>[]).map((d) => ({
            Type: d.event_type,
            Severity: d.severity,
            Confidence: d.confidence,
            Source: d.source,
            Date: d.created_at ? String(d.created_at).slice(0, 10) : "—",
          }));
          text += "\n" + formatTable(formatted);
        } else {
          text += "\n_No distress events recorded._";
        }

        // 4. Latest score
        const [score] = await query(
          `SELECT composite_score, motivation_score, deal_score, ai_boost,
                  severity_multiplier, stacking_bonus, equity_multiplier, model_version, created_at
           FROM scoring_records WHERE property_id = $1 ORDER BY created_at DESC LIMIT 1`,
          [propertyId],
        );

        if (score) {
          const sr = score as Record<string, unknown>;
          const cs = Number(sr.composite_score ?? 0);
          const tier = cs >= 85 ? "PLATINUM" : cs >= 65 ? "GOLD" : cs >= 40 ? "SILVER" : "BRONZE";
          text += `\n\n## Scoring (${sr.model_version ?? "—"})\n` +
            `**Composite:** ${cs} (${tier}) | **Motivation:** ${sr.motivation_score} | **Deal:** ${sr.deal_score}\n` +
            `**AI Boost:** +${sr.ai_boost ?? 0} | **Stacking Bonus:** +${sr.stacking_bonus ?? 0}\n` +
            `**Severity Mult:** ${sr.severity_multiplier} | **Equity Mult:** ${sr.equity_multiplier}`;
        }

        // 5. Latest prediction
        const [pred] = await query(
          `SELECT predictive_score, days_until_distress, confidence,
                  owner_age_inference, equity_burn_rate, life_event_probability
           FROM scoring_predictions WHERE property_id = $1 ORDER BY created_at DESC LIMIT 1`,
          [propertyId],
        );

        if (pred) {
          const sp = pred as Record<string, unknown>;
          text += `\n\n## Predictive Intelligence\n` +
            `**Predictive Score:** ${sp.predictive_score} | **Days Until Distress:** ${sp.days_until_distress}\n` +
            `**Confidence:** ${sp.confidence}% | **Life Event Prob:** ${sp.life_event_probability}%\n` +
            `**Owner Age Inference:** ${sp.owner_age_inference ?? "—"} | **Equity Burn Rate:** ${sp.equity_burn_rate ?? "—"}`;
        }

        // 6. Deals
        const deals = await query(
          `SELECT status, ask_price, offer_price, contract_price, assignment_fee, arv, repair_estimate, closed_at
           FROM deals WHERE property_id = $1 ORDER BY created_at DESC`,
          [propertyId],
        );

        if (deals.length > 0) {
          const formatted = (deals as Record<string, unknown>[]).map((d) => ({
            Status: d.status,
            Ask: formatCurrency(Number(d.ask_price ?? 0)),
            Offer: formatCurrency(Number(d.offer_price ?? 0)),
            Contract: formatCurrency(Number(d.contract_price ?? 0)),
            "Assign Fee": formatCurrency(Number(d.assignment_fee ?? 0)),
            ARV: formatCurrency(Number(d.arv ?? 0)),
            Closed: d.closed_at ? String(d.closed_at).slice(0, 10) : "—",
          }));
          text += `\n\n## Deals (${deals.length})\n` + formatTable(formatted);
        }

        // 7. Call history
        const calls = await query(
          `SELECT cl.started_at, cl.disposition, cl.duration_sec, cl.notes, cl.ai_summary, up.full_name AS agent
           FROM calls_log cl LEFT JOIN user_profiles up ON cl.user_id = up.id
           WHERE cl.property_id = $1 ORDER BY cl.started_at DESC LIMIT 10`,
          [propertyId],
        );

        if (calls.length > 0) {
          const formatted = (calls as Record<string, unknown>[]).map((c) => ({
            Date: c.started_at ? String(c.started_at).slice(0, 16) : "—",
            Disposition: c.disposition,
            Duration: `${c.duration_sec ?? 0}s`,
            Agent: c.agent ?? "—",
            Notes: c.notes ? String(c.notes).slice(0, 60) : "—",
          }));
          text += `\n\n## Call History (${calls.length})\n` + formatTable(formatted);
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
