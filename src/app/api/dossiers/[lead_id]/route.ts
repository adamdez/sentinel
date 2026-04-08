import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAuth } from "@/lib/api-auth";

/**
 * GET /api/dossiers/[lead_id]
 *
 * Returns the most recent REVIEWED dossier for a lead.
 * Returns null (not 404) when no reviewed dossier exists — callers use null
 * to know the block should not render.
 *
 * Proposed and flagged dossiers are intentionally NOT returned here.
 * The review queue (future) would use a different endpoint or query param.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ lead_id: string }> }
) {
  try {
    const sb = createServerClient();
    const user = await requireAuth(req, sb);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { lead_id } = await params;
    const includeProposed = new URL(req.url).searchParams.get("include_proposed") === "true";
    const statuses = includeProposed ? ["proposed", "reviewed", "promoted"] : ["reviewed", "promoted"];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (sb.from("dossiers") as any)
      .select(`
        id, lead_id, property_id, status,
        situation_summary, likely_decision_maker, top_facts,
        recommended_call_angle, verification_checklist, source_links,
        raw_ai_output,
        ai_run_id, reviewed_by, reviewed_at, review_notes,
        created_at, updated_at
      `)
      .eq("lead_id", lead_id)
      .in("status", statuses)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ dossier: data ?? null });
  } catch (err) {
    console.error("[API/dossiers] GET error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * POST /api/dossiers/[lead_id]
 *
 * Creates a proposed dossier for a lead.
 * Used by:
 *   1. The deep-crawl pipeline (fire-and-forget, after Phase 4 storage)
 *   2. Future manual entry if needed
 *
 * The caller provides already-structured fields. raw_ai_output is stored
 * for traceability but never surfaced to operators.
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

    const record = {
      lead_id,
      property_id: body.property_id ?? null,
      status: "proposed",
      situation_summary: body.situation_summary ?? null,
      likely_decision_maker: body.likely_decision_maker ?? null,
      top_facts: body.top_facts ?? null,
      recommended_call_angle: body.recommended_call_angle ?? null,
      verification_checklist: body.verification_checklist ?? null,
      source_links: body.source_links ?? null,
      raw_ai_output: body.raw_ai_output ?? null,
      ai_run_id: body.ai_run_id ?? null,
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (sb.from("dossiers") as any)
      .insert(record)
      .select("id, lead_id, status, created_at")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Set dossier_url on the lead so it's always navigable
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
    const dossierUrl = `${siteUrl}/dialer/review/dossier-queue?lead=${lead_id}`;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sb.from("leads") as any)
      .update({ dossier_url: dossierUrl, updated_at: new Date().toISOString() })
      .eq("id", lead_id);

    return NextResponse.json({ dossier: data }, { status: 201 });
  } catch (err) {
    console.error("[API/dossiers] POST error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
