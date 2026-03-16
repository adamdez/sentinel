import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAuth } from "@/lib/api-auth";

/**
 * GET  /api/dossiers/[lead_id]/facts
 * POST /api/dossiers/[lead_id]/facts
 *
 * Fact assertions layer for lead intelligence.
 * Every fact must reference an artifact — source provenance is mandatory.
 *
 * GET query params:
 *   ?artifact_id=UUID    — filter to one artifact (optional)
 *   ?review_status=pending|accepted|rejected  (optional)
 *   ?limit=N             — default 100, max 200
 *
 * POST body:
 *   {
 *     artifact_id:     string   (required — must belong to this lead)
 *     fact_type:       string   (default "other")
 *     fact_value:      string   (required, non-empty claim text)
 *     confidence?:     "unverified"|"low"|"medium"|"high"
 *     promoted_field?: string   (optional hint for dossier field mapping)
 *   }
 *
 * BOUNDARY: reads/writes fact_assertions only.
 * Does NOT write to leads, dossiers, or any CRM-owned table.
 */

// ── Shared types (live in @/lib/dossier-facts — re-exported here for compat) ──

export type { FactType, FactConfidence, FactReviewStatus } from "@/lib/dossier-facts";
import type { FactType, FactConfidence, FactReviewStatus } from "@/lib/dossier-facts";
import {
  FACT_TYPES,
  FACT_TYPE_LABELS,
  CONFIDENCE_LABELS,
  PROMOTED_FIELD_OPTIONS,
} from "@/lib/dossier-facts";

export interface FactAssertionRow {
  id:               string;
  artifact_id:      string;
  lead_id:          string;
  fact_type:        FactType;
  fact_value:       string;
  confidence:       FactConfidence;
  review_status:    FactReviewStatus;
  promoted_field:   string | null;
  reviewed_by:      string | null;
  reviewed_at:      string | null;
  asserted_by:      string | null;
  created_at:       string;
  updated_at:       string;
}

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ lead_id: string }> }
) {
  try {
    const sb = createServerClient();
    const user = await requireAuth(req, sb);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { lead_id } = await params;
    const { searchParams } = new URL(req.url);

    const artifactId    = searchParams.get("artifact_id") ?? null;
    const reviewStatus  = searchParams.get("review_status") ?? null;
    const limitRaw      = parseInt(searchParams.get("limit") ?? "100", 10);
    const limit         = Math.min(isNaN(limitRaw) ? 100 : limitRaw, 200);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q = (sb.from("fact_assertions") as any)
      .select("*")
      .eq("lead_id", lead_id)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (artifactId)   q = q.eq("artifact_id", artifactId);
    if (reviewStatus) q = q.eq("review_status", reviewStatus);

    const { data: facts, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ facts: facts ?? [] });
  } catch (err) {
    console.error("[API/dossiers/facts] GET error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ lead_id: string }> }
) {
  try {
    const sb = createServerClient();
    const user = await requireAuth(req, sb);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { lead_id } = await params;
    const body = await req.json().catch(() => ({}));

    const artifactId = (body.artifact_id ?? "").trim();
    if (!artifactId) {
      return NextResponse.json(
        { error: "artifact_id is required — every fact must reference a source artifact" },
        { status: 400 }
      );
    }

    const factValue = (body.fact_value ?? "").trim();
    if (!factValue) {
      return NextResponse.json({ error: "fact_value is required" }, { status: 400 });
    }

    const factType: FactType   = FACT_TYPES.includes(body.fact_type) ? body.fact_type : "other";
    const confidence: FactConfidence = ["unverified","low","medium","high"].includes(body.confidence)
      ? body.confidence : "unverified";

    // Verify the artifact belongs to this lead (source integrity check)
    // Also fetch run_id for provenance threading into fact_assertions.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: artifact, error: artErr } = await (sb.from("dossier_artifacts") as any)
      .select("id, lead_id, run_id")
      .eq("id", artifactId)
      .eq("lead_id", lead_id)
      .maybeSingle();

    if (artErr || !artifact) {
      return NextResponse.json(
        { error: "Artifact not found for this lead — cannot create fact without a valid source" },
        { status: 422 }
      );
    }

    const promotedField = (body.promoted_field ?? "").trim() || null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: fact, error: insertErr } = await (sb.from("fact_assertions") as any)
      .insert({
        artifact_id:    artifactId,
        lead_id,
        fact_type:      factType,
        fact_value:     factValue,
        confidence,
        review_status:  "pending",
        promoted_field: promotedField,
        asserted_by:    user.id,
        run_id:         artifact.run_id ?? null,
      })
      .select("*")
      .single();

    if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });

    return NextResponse.json({ fact }, { status: 201 });
  } catch (err) {
    console.error("[API/dossiers/facts] POST error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
