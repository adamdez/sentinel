/**
 * GET   /api/dialer/v1/outbound-prep/[frame_id] — fetch single frame
 * PATCH /api/dialer/v1/outbound-prep/[frame_id] — review/annotate a frame
 *
 * PREP ONLY — no live calls, no Twilio.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerClient }        from "@/lib/supabase";
import type { PrepFrameReviewStatus } from "@/lib/outbound-prep";

const VALID_REVIEW_STATUSES: PrepFrameReviewStatus[] = [
  "pending", "approved", "flagged", "rejected",
];

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ frame_id: string }> },
) {
  const sb = createServerClient();
  const { frame_id } = await params;

  const { data, error } = await (sb as any)
    .from("outbound_prep_frames")
    .select("*")
    .eq("id", frame_id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Frame not found" }, { status: 404 });
  }

  return NextResponse.json({ frame: data });
}

// ── PATCH ─────────────────────────────────────────────────────────────────────

export interface PatchFrameRequest {
  review_status?:  PrepFrameReviewStatus;
  reviewer_notes?: string;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ frame_id: string }> },
) {
  const sb = createServerClient();
  const { frame_id } = await params;

  let body: PatchFrameRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { review_status, reviewer_notes } = body;

  if (review_status && !VALID_REVIEW_STATUSES.includes(review_status)) {
    return NextResponse.json(
      { error: `Invalid review_status. Must be one of: ${VALID_REVIEW_STATUSES.join(", ")}` },
      { status: 400 },
    );
  }

  const { data: { user } } = await sb.auth.getUser();

  const patch: Record<string, unknown> = {};
  if (review_status  !== undefined) patch.review_status  = review_status;
  if (reviewer_notes !== undefined) patch.reviewer_notes = reviewer_notes;
  if (review_status  !== undefined) {
    patch.reviewed_by = user?.id ?? null;
    patch.reviewed_at = new Date().toISOString();
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const { data, error } = await (sb as any)
    .from("outbound_prep_frames")
    .update(patch)
    .eq("id", frame_id)
    .select()
    .single();

  if (error) {
    console.error("[outbound-prep PATCH]", error);
    return NextResponse.json({ error: "Failed to update frame" }, { status: 500 });
  }

  return NextResponse.json({ frame: data });
}
