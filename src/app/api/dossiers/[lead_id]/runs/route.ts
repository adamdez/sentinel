import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAuth } from "@/lib/api-auth";

/**
 * GET  /api/dossiers/[lead_id]/runs   — list research runs for a lead
 * POST /api/dossiers/[lead_id]/runs   — start a new research run
 *
 * ── GET ──────────────────────────────────────────────────────────────────────
 * Query params:
 *   ?limit=N   default 10, max 50
 *   ?status=open|compiled|closed|abandoned  (optional filter)
 *
 * Returns runs ordered by started_at DESC, each with counts and dossier linkage.
 *
 * ── POST ─────────────────────────────────────────────────────────────────────
 * Body:
 *   notes?       string   — operator note for this session
 *   property_id? string
 *
 * Creates a new run in status=open. Only one open run per lead is allowed —
 * if an open run already exists, returns it instead of creating a duplicate.
 *
 * BOUNDARY: reads/writes research_runs only (plus reading open-run check).
 * Does NOT write to leads, dossiers, artifacts, or CRM-owned tables.
 */

// ── Shared types (exported for hook + component) ─────────────────────────────

export type ResearchRunStatus = "open" | "compiled" | "closed" | "abandoned";

export interface ResearchRunRow {
  id:             string;
  lead_id:        string;
  property_id:    string | null;
  status:         ResearchRunStatus;
  started_by:     string | null;
  started_at:     string;
  closed_at:      string | null;
  notes:          string | null;
  dossier_id:     string | null;
  source_mix:     string[] | null;
  artifact_count: number;
  fact_count:     number;
  created_at:     string;
  updated_at:     string;
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

    const limitRaw = parseInt(searchParams.get("limit") ?? "10", 10);
    const limit    = Math.min(isNaN(limitRaw) ? 10 : limitRaw, 50);
    const status   = searchParams.get("status") ?? null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q = (sb.from("research_runs") as any)
      .select("*")
      .eq("lead_id", lead_id)
      .order("started_at", { ascending: false })
      .limit(limit);

    if (status) q = q.eq("status", status);

    const { data: runs, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ runs: runs ?? [] });
  } catch (err) {
    console.error("[API/dossiers/runs] GET error:", err);
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

    // Check for an existing open run — return it to avoid duplicates
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existing } = await (sb.from("research_runs") as any)
      .select("*")
      .eq("lead_id", lead_id)
      .eq("status", "open")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ run: existing, reused: true });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: run, error } = await (sb.from("research_runs") as any)
      .insert({
        lead_id,
        property_id:    body.property_id ?? null,
        status:         "open",
        started_by:     user.id,
        notes:          (body.notes ?? "").trim() || null,
        artifact_count: 0,
        fact_count:     0,
      })
      .select("*")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ run, reused: false }, { status: 201 });
  } catch (err) {
    console.error("[API/dossiers/runs] POST error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
