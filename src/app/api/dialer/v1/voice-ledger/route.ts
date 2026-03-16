/**
 * GET /api/dialer/v1/voice-ledger
 *
 * Returns voice_interaction_ledger rows for review surfaces.
 * Supports filtering by risk_tier, review_status, interaction_type, and date range.
 *
 * Query params:
 *   risk_tier?       — low | medium | high | review
 *   review_status?   — pending | reviewed | corrected | dismissed
 *   interaction_type? — inbound_seller | warm_transfer_attempt | etc.
 *   days?            — lookback window in days (default 14)
 *   limit?           — max rows (default 50, max 200)
 *   include_low?     — "true" to include low-risk rows (default excludes them)
 *
 * Adam-only. Read-only endpoint.
 */

export const dynamic = "force-dynamic";
export const runtime  = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAuth } from "@/lib/api-auth";
import type { VoiceLedgerEntry } from "@/lib/voice-consent";

export async function GET(req: NextRequest) {
  try {
    const sb   = createServerClient();
    const user = await requireAuth(req, sb);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const riskTier        = searchParams.get("risk_tier")        ?? null;
    const reviewStatus    = searchParams.get("review_status")    ?? null;
    const interactionType = searchParams.get("interaction_type") ?? null;
    const days            = Math.min(parseInt(searchParams.get("days") ?? "14", 10), 90);
    const limit           = Math.min(parseInt(searchParams.get("limit") ?? "50", 10), 200);
    const includeLow      = searchParams.get("include_low") === "true";

    const since = new Date(Date.now() - days * 86_400_000).toISOString();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query = (sb.from("voice_interaction_ledger") as any)
      .select("*")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (riskTier)        query = query.eq("risk_tier",        riskTier);
    if (reviewStatus)    query = query.eq("review_status",    reviewStatus);
    if (interactionType) query = query.eq("interaction_type", interactionType);
    if (!includeLow && !riskTier) {
      // Default: exclude low-risk rows — review surface focuses on medium/high/review
      query = query.neq("risk_tier", "low");
    }

    const { data, error } = await query;

    if (error) {
      console.error("[voice-ledger] GET error:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows: VoiceLedgerEntry[] = data ?? [];

    // Summary counts for the card header
    const counts = {
      total:   rows.length,
      high:    rows.filter((r: VoiceLedgerEntry) => r.risk_tier === "high").length,
      review:  rows.filter((r: VoiceLedgerEntry) => r.risk_tier === "review").length,
      medium:  rows.filter((r: VoiceLedgerEntry) => r.risk_tier === "medium").length,
      pending: rows.filter((r: VoiceLedgerEntry) => r.review_status === "pending").length,
    };

    return NextResponse.json({ rows, counts, days });
  } catch (err) {
    console.error("[voice-ledger] GET error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
