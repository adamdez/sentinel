import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { createServerClient } from "@/lib/supabase";
import {
  loadTinaStoredPacketVersion,
  reviewTinaStoredPacketVersion,
} from "@/tina/lib/server-packet-store";
import {
  summarizeTinaStoredPacketVersion,
  type TinaPacketReviewDecision,
} from "@/tina/lib/packet-versions";

type RouteContext = {
  params: Promise<{
    fingerprint: string;
  }>;
};

export async function GET(req: NextRequest, context: RouteContext) {
  const sb = createServerClient();
  const user = await requireAuth(req, sb);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { fingerprint } = await context.params;
  const safeFingerprint = typeof fingerprint === "string" ? fingerprint.trim() : "";

  if (!safeFingerprint) {
    return NextResponse.json({ error: "Missing packet fingerprint" }, { status: 400 });
  }

  try {
    const packet = await loadTinaStoredPacketVersion(sb, user.id, safeFingerprint);

    if (!packet) {
      return NextResponse.json({ error: "Saved Tina packet not found." }, { status: 404 });
    }

    return NextResponse.json({
      packet,
      summary: summarizeTinaStoredPacketVersion(packet),
    });
  } catch {
    return NextResponse.json({ error: "Failed to load the saved Tina packet" }, { status: 500 });
  }
}

function normalizeReviewDecision(value: unknown): TinaPacketReviewDecision | null {
  switch (value) {
    case "unreviewed":
    case "reference_only":
    case "needs_follow_up":
    case "approved_for_handoff":
      return value;
    default:
      return null;
  }
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  const sb = createServerClient();
  const user = await requireAuth(req, sb);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { fingerprint } = await context.params;
  const safeFingerprint = typeof fingerprint === "string" ? fingerprint.trim() : "";

  if (!safeFingerprint) {
    return NextResponse.json({ error: "Missing packet fingerprint" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const review =
    typeof body === "object" && body !== null && "review" in body
      ? (body as { review?: unknown }).review
      : null;

  if (typeof review !== "object" || review === null) {
    return NextResponse.json({ error: "Missing review payload" }, { status: 400 });
  }

  const decision = normalizeReviewDecision((review as { decision?: unknown }).decision);
  const reviewerName =
    typeof (review as { reviewerName?: unknown }).reviewerName === "string"
      ? (review as { reviewerName?: string }).reviewerName?.trim() ?? ""
      : "";
  const reviewerNote =
    typeof (review as { reviewerNote?: unknown }).reviewerNote === "string"
      ? (review as { reviewerNote?: string }).reviewerNote?.trim() ?? ""
      : "";

  if (!decision) {
    return NextResponse.json({ error: "Invalid review decision" }, { status: 400 });
  }

  try {
    const result = await reviewTinaStoredPacketVersion(sb, user.id, safeFingerprint, {
      decision,
      reviewerName,
      reviewerNote,
    });

    if (!result.packet) {
      return NextResponse.json({ error: "Saved Tina packet not found." }, { status: 404 });
    }

    return NextResponse.json({
      packet: result.packet,
      summary: summarizeTinaStoredPacketVersion(result.packet),
      packetVersions: result.packetVersions,
    });
  } catch {
    return NextResponse.json({ error: "Failed to save the packet review" }, { status: 500 });
  }
}
