import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAuth } from "@/lib/api-auth";
import {
  getSourcePolicies,
  buildPolicyMap,
  evaluateArtifacts,
} from "@/lib/source-policy";

/**
 * POST /api/dossiers/[lead_id]/compile
 *
 * Compiles captured artifacts for a lead into a new PROPOSED dossier.
 * This is the bridge between "operator collected evidence" and
 * "a reviewable dossier exists." No AI is called — field mapping is
 * deterministic from artifact content.
 *
 * The resulting dossier has status = 'proposed' and must go through the
 * existing PATCH /review → POST /promote path before touching lead truth.
 *
 * Body:
 *   artifact_ids?    string[]  — subset of artifact IDs to include (default: all for lead)
 *   property_id?     string
 *   situation_summary?  string  — optional operator-written summary to seed the dossier
 *   include_blocked? boolean   — if true, include artifacts whose source_type is "blocked"
 *                                (default: false — blocked artifacts are excluded)
 *   run_id?          string    — if provided, this compile closes the research run and
 *                                links the resulting dossier to it.
 *
 * Returns:
 *   { dossier, compiled_from, excluded_blocked, policy_flags }
 *   policy_flags: array of { artifact_id, source_type, policy, rationale } for
 *   all non-approved artifacts that were compiled in (review_required or blocked-override).
 *   Stored in dossier.raw_ai_output.policy_flags for dossier review visibility.
 *
 * Side effects:
 *   - links included artifacts to the new dossier via dossier_id
 *   - if run_id is provided: sets run.status=compiled, run.dossier_id=dossier.id
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ lead_id: string }> }
) {
  try {
    const sb = createServerClient();
    const user = await requireAuth(req, sb);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { lead_id } = await params;
    const body = await req.json();

    const includeBlocked = !!body.include_blocked;

    // ── 1. Fetch artifacts to include ─────────────────────────────────

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let artifactQuery = (sb.from("dossier_artifacts") as any)
      .select("id, source_url, source_type, source_label, extracted_notes, captured_at")
      .eq("lead_id", lead_id)
      .order("created_at", { ascending: true });

    if (Array.isArray(body.artifact_ids) && body.artifact_ids.length > 0) {
      artifactQuery = artifactQuery.in("id", body.artifact_ids);
    }

    const { data: rawArtifacts, error: artifactErr } = await artifactQuery;

    if (artifactErr) return NextResponse.json({ error: artifactErr.message }, { status: 500 });

    if (!rawArtifacts || rawArtifacts.length === 0) {
      return NextResponse.json(
        { error: "No artifacts found for this lead. Capture at least one source before compiling." },
        { status: 422 }
      );
    }

    // ── 1b. Apply source policy ────────────────────────────────────────
    const policies = await getSourcePolicies();
    const policyMap = buildPolicyMap(policies);
    const {
      allowed: allowedSlim,
      blocked: excludedArtifacts,
      flags:   policyFlags,
    } = evaluateArtifacts(rawArtifacts, policyMap, includeBlocked);

    // Re-join with full artifact rows so downstream mapping still has all fields
    const allowedIds = new Set(allowedSlim.map(a => a.id));
    const artifacts  = rawArtifacts.filter((a: { id: string }) => allowedIds.has(a.id));

    if (artifacts.length === 0) {
      return NextResponse.json(
        {
          error: "All artifacts for this lead have a 'blocked' source policy and were excluded from compile. Set include_blocked=true to override, or capture approved sources.",
          excluded_blocked: excludedArtifacts.length,
          policy_flags: policyFlags,
        },
        { status: 422 }
      );
    }

    // ── 2. Map artifacts → dossier fields ─────────────────────────────
    // Deterministic — no AI. Each artifact's extracted_notes becomes a top_fact.
    // Source URLs become source_links. Verification checklist seeds from facts
    // that look unverified (no notes yet = needs verification).

    const topFacts: { fact: string; source: string }[] = artifacts
      .filter((a: { extracted_notes: string | null }) => a.extracted_notes)
      .map((a: { extracted_notes: string; source_label: string | null; source_url: string | null; source_type: string }) => ({
        fact: a.extracted_notes!,
        source: a.source_label ?? a.source_url ?? a.source_type,
      }));

    const sourceLinks: { label: string; url: string }[] = artifacts
      .filter((a: { source_url: string | null }) => a.source_url)
      .map((a: { source_url: string; source_label: string | null; source_type: string }) => ({
        label: a.source_label ?? a.source_type,
        url: a.source_url!,
      }));

    // Seed verification checklist: artifacts with no extracted_notes need review
    const verificationChecklist: { item: string; verified: boolean }[] = artifacts
      .filter((a: { extracted_notes: string | null; source_label: string | null; source_url: string | null; source_type: string }) => !a.extracted_notes)
      .map((a: { source_label: string | null; source_url: string | null; source_type: string }) => ({
        item: `Verify: ${a.source_label ?? a.source_url ?? a.source_type}`,
        verified: false,
      }));

    // ── 3. Insert new proposed dossier ────────────────────────────────

    const dossierRecord = {
      lead_id,
      property_id: body.property_id ?? null,
      status: "proposed",
      situation_summary: body.situation_summary ?? null,
      likely_decision_maker: null,  // operator fills in during review
      top_facts: topFacts.length > 0 ? topFacts : null,
      recommended_call_angle: null, // operator fills in during review
      verification_checklist: verificationChecklist.length > 0 ? verificationChecklist : null,
      source_links: sourceLinks.length > 0 ? sourceLinks : null,
      // Store policy flags in raw_ai_output so the dossier review surface
      // can surface them without a separate join.
      raw_ai_output: (policyFlags.length > 0 || body.dossier_type)
        ? {
            ...(policyFlags.length > 0 ? { policy_flags: policyFlags, excluded_blocked: excludedArtifacts.length } : {}),
            ...(body.dossier_type ? { dossier_type: body.dossier_type } : {}),
          }
        : null,
      ai_run_id: (body.run_id ?? "").trim() || `manual-compile-${new Date().toISOString()}`,
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: dossier, error: dossierErr } = await (sb.from("dossiers") as any)
      .insert(dossierRecord)
      .select("id, lead_id, status, created_at")
      .single();

    if (dossierErr) return NextResponse.json({ error: dossierErr.message }, { status: 500 });

    // ── 4. Link artifacts to the new dossier ─────────────────────────

    const artifactIds = artifacts.map((a: { id: string }) => a.id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sb.from("dossier_artifacts") as any)
      .update({ dossier_id: dossier.id, updated_at: new Date().toISOString() })
      .in("id", artifactIds);

    // ── 5. Close the research run if one was provided ─────────────────
    const runId = (body.run_id ?? "").trim() || null;
    if (runId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (sb.from("research_runs") as any)
        .update({
          status:     "compiled",
          dossier_id: dossier.id,
          closed_at:  new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", runId)
        .eq("lead_id", lead_id);
    }

    return NextResponse.json({
      dossier,
      compiled_from:    artifactIds.length,
      excluded_blocked: excludedArtifacts.length,
      policy_flags:     policyFlags,
    }, { status: 201 });
  } catch (err) {
    console.error("[API/dossiers/compile] POST error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
