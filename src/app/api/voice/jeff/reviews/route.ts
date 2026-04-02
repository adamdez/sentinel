export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAuth } from "@/lib/api-auth";
import {
  buildJeffQualityTuningSummary,
  getUserProfile,
  isJeffController,
  listJeffReviews,
  upsertJeffReview,
} from "@/lib/jeff-control";

export async function GET(req: NextRequest) {
  const sb = createServerClient();
  const user = await requireAuth(req, sb);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") ?? "50"), 100);
  const reviews = await listJeffReviews(limit);
  const tuning = buildJeffQualityTuningSummary(reviews as Array<Record<string, unknown>>);
  return NextResponse.json({ reviews, tuning });
}

export async function POST(req: NextRequest) {
  const sb = createServerClient();
  const user = await requireAuth(req, sb);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profile = await getUserProfile(user.id);
  if (!isJeffController(profile?.email)) {
    return NextResponse.json({ error: "Only Adam can submit Jeff reviews." }, { status: 403 });
  }

  let body: { voiceSessionId?: string; reviewTags?: string[]; score?: number; notes?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.voiceSessionId) {
    return NextResponse.json({ error: "voiceSessionId is required" }, { status: 400 });
  }

  const reviews = await upsertJeffReview({
    voiceSessionId: body.voiceSessionId,
    reviewerId: user.id,
    reviewTags: Array.isArray(body.reviewTags) ? body.reviewTags : [],
    score: typeof body.score === "number" ? body.score : null,
    notes: body.notes ?? null,
  });

  const tuning = buildJeffQualityTuningSummary(reviews as Array<Record<string, unknown>>);
  return NextResponse.json({ reviews, tuning });
}
