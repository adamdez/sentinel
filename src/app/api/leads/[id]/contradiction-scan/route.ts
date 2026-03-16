/**
 * POST /api/leads/[id]/contradiction-scan
 *
 * Manually triggered contradiction scan for a lead.
 * Runs the 4 deterministic contradiction checks and writes findings to
 * lead_contradiction_flags.
 *
 * Idempotent: clears existing unreviewed flags for this lead before writing new ones.
 * Already-reviewed flags (real / false_positive / resolved) are preserved.
 *
 * Only runs for authenticated users. No admin-only gate — both Adam and Logan
 * can trigger a scan, but the flags surface is primarily Adam's review tool.
 *
 * BOUNDARY:
 *   - Reads: leads, fact_assertions, lead_objection_tags
 *   - Writes: lead_contradiction_flags only (never CRM tables)
 */

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { runContradictionChecks } from "@/lib/contradiction-checks";
import type { ContradictionScanInput } from "@/lib/contradiction-checks";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: RouteContext) {
  const sb = createServerClient();

  const { data: { user } } = await sb.auth.getUser(
    req.headers.get("authorization")?.replace("Bearer ", "") ?? ""
  );
  if (!user) {
    // Fall back to cookie-based session (server component path)
    const { data: { session } } = await sb.auth.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const userId = user?.id ?? (await sb.auth.getSession()).data.session?.user.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: leadId } = await params;

  // ── 1. Fetch lead qual fields ──────────────────────────────────────────────
  const { data: lead, error: leadErr } = await sb
    .from("leads")
    .select("decision_maker_confirmed, occupancy_score, qualification_route, condition_level")
    .eq("id", leadId)
    .maybeSingle();

  if (leadErr || !lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  // ── 2. Fetch accepted fact assertions ──────────────────────────────────────
  const { data: facts } = await sb
    .from("fact_assertions")
    .select("id, fact_type, fact_value, artifact_id")
    .eq("lead_id", leadId)
    .eq("review_status", "accepted");

  // ── 3. Fetch open objection tags ───────────────────────────────────────────
  const { data: objRows } = await sb
    .from("lead_objection_tags")
    .select("tag")
    .eq("lead_id", leadId)
    .eq("status", "open");

  const openObjectionTags = (objRows ?? []).map((r: { tag: string }) => r.tag);

  // ── 4. Run checks ─────────────────────────────────────────────────────────
  const scanInput: ContradictionScanInput = {
    lead: {
      decision_maker_confirmed: (lead as { decision_maker_confirmed: boolean | null }).decision_maker_confirmed ?? false,
      occupancy_score:          (lead as { occupancy_score: number | null }).occupancy_score ?? null,
      qualification_route:      (lead as { qualification_route: string | null }).qualification_route ?? null,
      condition_level:          (lead as { condition_level: number | null }).condition_level ?? null,
    },
    acceptedFacts: (facts ?? []).map((f: { id: string; fact_type: string; fact_value: string; artifact_id: string | null }) => ({
      id:          f.id,
      fact_type:   f.fact_type,
      fact_value:  f.fact_value,
      artifact_id: f.artifact_id,
    })),
    openObjectionTags,
  };

  const contradictions = runContradictionChecks(scanInput);

  // ── 5. Clear old unreviewed flags and write new ones ──────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sbAny = sb as any;

  await sbAny
    .from("lead_contradiction_flags")
    .delete()
    .eq("lead_id", leadId)
    .eq("status", "unreviewed");

  if (contradictions.length > 0) {
    const rows = contradictions.map((c) => ({
      lead_id:     leadId,
      check_type:  c.check_type,
      severity:    c.severity,
      description: c.description,
      evidence_a:  c.evidence_a,
      evidence_b:  c.evidence_b,
      fact_id:     c.fact_id ?? null,
      artifact_id: c.artifact_id ?? null,
      status:      "unreviewed",
      scanned_by:  userId,
    }));

    const { error: insertErr } = await sbAny
      .from("lead_contradiction_flags")
      .insert(rows);

    if (insertErr) {
      console.error("[contradiction-scan] insert failed:", insertErr.message);
      return NextResponse.json({ error: "Failed to save flags" }, { status: 500 });
    }
  }

  return NextResponse.json({
    ok:          true,
    flag_count:  contradictions.length,
    flags:       contradictions,
  });
}
