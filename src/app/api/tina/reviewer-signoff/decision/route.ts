import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { createServerClient } from "@/lib/supabase";
import { parseTinaWorkspaceDraft } from "@/tina/lib/workspace-draft";
import { applyTinaReviewerDecision } from "@/tina/lib/workflow-state";
import type { TinaReviewerDecision } from "@/tina/types";

export async function POST(req: NextRequest) {
  const sb = createServerClient();
  const user = await requireAuth(req, sb);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (
    typeof body !== "object" ||
    body === null ||
    !("draft" in body) ||
    !("snapshotId" in body) ||
    !("decision" in body)
  ) {
    return NextResponse.json({ error: "Missing reviewer decision payload" }, { status: 400 });
  }

  const payload = body as {
    draft: unknown;
    snapshotId: string;
    decision: TinaReviewerDecision;
    notes?: string;
    reviewerName?: string;
  };

  if (
    payload.decision !== "approved" &&
    payload.decision !== "changes_requested" &&
    payload.decision !== "revoked"
  ) {
    return NextResponse.json({ error: "Invalid reviewer decision" }, { status: 400 });
  }

  const draft = parseTinaWorkspaceDraft(JSON.stringify(payload.draft));
  const updatedDraft = applyTinaReviewerDecision(draft, {
    snapshotId: payload.snapshotId,
    reviewerName: payload.reviewerName?.trim() || user.email || user.id,
    decision: payload.decision,
    notes: payload.notes,
  });

  return NextResponse.json({
    draft: updatedDraft,
    reviewerDecision: updatedDraft.reviewerDecisions[0] ?? null,
    decidedBy: user.id,
  });
}
