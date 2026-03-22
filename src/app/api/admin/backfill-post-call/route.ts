/**
 * POST /api/admin/backfill-post-call
 *
 * Backfills seller memory (post_call_structures) for historical calls_log rows
 * that have notes content but no corresponding post_call_structures row.
 *
 * Processes sequentially to avoid overloading the AI endpoint.
 *
 * Auth: Bearer token validated via requireAuth
 *
 * Body (optional):
 *   { "limit": number }   — max rows to process (default 50, max 200)
 *
 * Response:
 *   { processed, succeeded, failed, errors }
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAuth } from "@/lib/api-auth";
import { runPostCallAnalysis } from "@/lib/dialer/post-call-analysis";

export async function POST(req: NextRequest) {
  const sb = createServerClient();

  // ── Auth ────────────────────────────────────────────────────
  const user = await requireAuth(req, sb);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Parse body ──────────────────────────────────────────────
  let limit = 50;
  try {
    const body = await req.json().catch(() => ({}));
    if (typeof body.limit === "number" && body.limit > 0) {
      limit = Math.min(Math.floor(body.limit), 200);
    }
  } catch {
    // use default
  }

  // ── Find calls_log rows missing post_call_structures ────────
  // LEFT JOIN to post_call_structures on session_id to find gaps.
  // Supabase JS client doesn't support LEFT JOIN exclusion natively,
  // so we use an RPC-style raw query via .rpc or a two-step approach.
  // Using a raw SQL query for precision.

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: candidates, error: queryError } = await (sb as any).rpc(
    "backfill_post_call_candidates" as never,
    {} as never,
  ).catch(() => ({ data: null, error: { message: "rpc not available" } }));

  // Fallback: if no RPC exists, use a two-step approach
  let rows: Array<{
    id: string;
    session_id: string;
    lead_id: string | null;
    user_id: string | null;
    notes: string;
  }> = [];

  if (queryError || !candidates) {
    // Step 1: Get calls_log rows with notes and session_id
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: callRows, error: callErr } = await (sb.from("calls_log") as any)
      .select("id, session_id, lead_id, user_id, notes")
      .not("notes", "is", null)
      .neq("notes", "")
      .not("session_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(500); // fetch extra to account for filtering

    if (callErr) {
      return NextResponse.json(
        { error: `Failed to query calls_log: ${callErr.message}` },
        { status: 500 },
      );
    }

    if (!callRows || callRows.length === 0) {
      return NextResponse.json({
        processed: 0,
        succeeded: 0,
        failed: 0,
        errors: [],
        message: "No calls_log rows with notes found",
      });
    }

    // Step 2: Get existing post_call_structures session_ids
    const sessionIds = (callRows as Array<{ session_id: string }>).map(
      (r) => r.session_id,
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existingStructures } = await (sb.from("post_call_structures") as any)
      .select("session_id")
      .in("session_id", sessionIds);

    const existingSet = new Set<string>(
      ((existingStructures ?? []) as Array<{ session_id: string }>).map(
        (r) => r.session_id,
      ),
    );

    // Filter to rows without existing structures, apply limit
    rows = (callRows as typeof rows).filter(
      (r) => r.session_id && !existingSet.has(r.session_id),
    ).slice(0, limit);
  }

  if (rows.length === 0) {
    return NextResponse.json({
      processed: 0,
      succeeded: 0,
      failed: 0,
      errors: [],
      message: "All calls_log rows with notes already have post_call_structures",
    });
  }

  // ── Process sequentially ────────────────────────────────────
  let succeeded = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const row of rows) {
    try {
      const result = await runPostCallAnalysis(sb, {
        sessionId: row.session_id,
        transcript: row.notes,
        callsLogId: row.id,
        leadId: row.lead_id,
        publishedBy: row.user_id ?? user.id,
      });

      if (result.ok) {
        succeeded++;
      } else {
        failed++;
        errors.push(`calls_log ${row.id}: ${result.error ?? "unknown error"}`);
      }
    } catch (err) {
      failed++;
      errors.push(
        `calls_log ${row.id}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return NextResponse.json({
    processed: rows.length,
    succeeded,
    failed,
    errors,
  });
}
