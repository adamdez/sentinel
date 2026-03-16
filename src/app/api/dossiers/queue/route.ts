import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAuth } from "@/lib/api-auth";
import { getSourcePolicies, buildPolicyMap } from "@/lib/source-policy";
import { computeTriageSignals, type TriageInput } from "@/lib/dossier-triage";

/**
 * GET /api/dossiers/queue
 *
 * Returns dossiers with joined lead + property context for the review queue.
 * For proposed dossiers, each item includes a `triage` block computed from
 * deterministic signals: source policies, writeback risk, prior flags, evidence
 * confidence, and field completeness.
 *
 * Query params:
 *   status   = "proposed" (default) | "reviewed" | "flagged" | "promoted" | "all"
 *   limit    = number (default 25, max 50)
 *   offset   = number (default 0)
 *   sort     = "triage" (default for proposed) | "created_at"
 *
 * Returns:
 *   {
 *     items:  DossierQueueItem[],  // with triage attached for proposed items
 *     total:  number,
 *     limit:  number,
 *     offset: number,
 *   }
 */
export async function GET(req: NextRequest) {
  try {
    const sb = createServerClient();
    const user = await requireAuth(req, sb);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const statusParam = searchParams.get("status") ?? "proposed";
    const sortParam   = searchParams.get("sort") ?? (statusParam === "proposed" ? "triage" : "created_at");
    const limit  = Math.min(Number(searchParams.get("limit")  ?? "25"), 50);
    const offset = Number(searchParams.get("offset") ?? "0");

    // ── 1. Fetch dossier rows ─────────────────────────────────────────────────

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query = (sb.from("dossiers") as any)
      .select(`
        id,
        lead_id,
        property_id,
        status,
        situation_summary,
        likely_decision_maker,
        top_facts,
        recommended_call_angle,
        verification_checklist,
        source_links,
        raw_ai_output,
        ai_run_id,
        reviewed_by,
        reviewed_at,
        review_notes,
        created_at,
        updated_at,
        leads!inner (
          id,
          first_name,
          last_name,
          phone,
          stage,
          status,
          notes,
          decision_maker_note,
          monetizability_score,
          dispo_friction_level,
          source,
          assigned_to,
          created_at
        ),
        properties (
          id,
          address,
          city,
          state,
          zip,
          county
        )
      `, { count: "exact" });

    if (statusParam !== "all") {
      query = query.eq("status", statusParam);
    }

    // Always fetch newest first initially; triage sort happens in JS after enrichment
    const { data: rawItems, error, count } = await query
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const items: Record<string, unknown>[] = rawItems ?? [];

    // ── 2. Triage enrichment (proposed items only) ────────────────────────────
    // We compute triage for proposed items. Non-proposed items get triage: null.

    if (statusParam === "proposed" || statusParam === "all") {
      const proposedItems = items.filter(i => i.status === "proposed");

      if (proposedItems.length > 0) {
        const leadIds  = [...new Set(proposedItems.map(i => i.lead_id as string))];
        const dossierIds = proposedItems.map(i => i.id as string);

        // Fetch source policies once
        const policies   = await getSourcePolicies();
        const policyMap  = buildPolicyMap(policies);

        // Fetch prior flagged dossiers for these leads (proposed dossiers excluded)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: flaggedRows } = await (sb.from("dossiers") as any)
          .select("lead_id")
          .in("lead_id", leadIds)
          .eq("status", "flagged");

        const flaggedLeadIds = new Set<string>(
          (flaggedRows ?? []).map((r: { lead_id: string }) => r.lead_id)
        );

        // Fetch fact counts per dossier via artifact linkage
        // fact_assertions → dossier_artifacts → dossier_id
        // We use artifact's dossier_id to match facts to dossiers.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: factRows } = await (sb.from("fact_assertions") as any)
          .select("lead_id")
          .in("lead_id", leadIds)
          .eq("review_status", "accepted");

        // Count accepted facts per lead (close enough — facts don't yet FK to dossier)
        const factCountByLead: Record<string, number> = {};
        for (const row of (factRows ?? []) as Array<{ lead_id: string }>) {
          factCountByLead[row.lead_id] = (factCountByLead[row.lead_id] ?? 0) + 1;
        }

        // Resolve policy_flags for each item from raw_ai_output or re-evaluate
        // Use stored policy_flags from raw_ai_output if present (already computed at compile time)
        for (const item of proposedItems) {
          const rawAiOutput = item.raw_ai_output as Record<string, unknown> | null;
          const leads       = item.leads as { decision_maker_note: string | null } | null;

          // Extract stored policy flags from compile time
          const storedPolicyFlags = rawAiOutput?.policy_flags as
            Array<{ source_type: string; policy: string }> | null ?? null;

          // If no stored flags, derive from source_links source types against policy map
          // (best-effort for dossiers compiled before policy-flag storage was added)
          let resolvedFlags = storedPolicyFlags;
          if (!resolvedFlags || resolvedFlags.length === 0) {
            const sourceLinks = item.source_links as Array<{ label: string; url: string }> | null ?? [];
            resolvedFlags = sourceLinks.length > 0 ? [] : null;
            // We can't derive policy from URL alone — leave null, only no-source signals will fire
          }

          const triageInput: TriageInput = {
            situation_summary:     item.situation_summary as string | null,
            likely_decision_maker: item.likely_decision_maker as string | null,
            verification_checklist: item.verification_checklist as Array<{ item: string; verified: boolean }> | null,
            source_links:          item.source_links as Array<{ label: string; url: string }> | null,
            raw_ai_output:         rawAiOutput,
            decision_maker_note:   leads?.decision_maker_note ?? null,
            prior_dossier_flagged: flaggedLeadIds.has(item.lead_id as string),
            fact_count:            factCountByLead[item.lead_id as string] ?? 0,
            policy_flags:          resolvedFlags,
          };

          item.triage = computeTriageSignals(triageInput);
        }

        // Suppress triage field for non-proposed items in "all" view
        for (const item of items) {
          if (item.status !== "proposed" && !item.triage) {
            item.triage = null;
          }
        }
      }
    }

    // ── 3. Sort ───────────────────────────────────────────────────────────────
    // "triage" sort: highest triage score first, then oldest first (most urgent)
    // "created_at" sort: newest first (DB ordering preserved)

    if (sortParam === "triage" && (statusParam === "proposed" || statusParam === "all")) {
      items.sort((a, b) => {
        const scoreA = (a.triage as { score: number } | null)?.score ?? 0;
        const scoreB = (b.triage as { score: number } | null)?.score ?? 0;
        if (scoreB !== scoreA) return scoreB - scoreA;
        // Tie-break: older items first (been waiting longer)
        return (a.created_at as string) < (b.created_at as string) ? -1 : 1;
      });
    }

    return NextResponse.json({
      items,
      total:  count ?? 0,
      limit,
      offset,
      sort:   sortParam,
    });
  } catch (err) {
    console.error("[API/dossiers/queue] GET error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
